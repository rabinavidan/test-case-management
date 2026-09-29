package com.testflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.testflow.api.support.AuthSupport;
import com.testflow.api.support.BaseApiTest;
import com.testflow.api.support.GraphQL;
import com.testflow.api.support.WsClient;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * GraphQL `runUpdates` subscription over graphql-transport-ws, spoken by hand on a JDK
 * WebSocket: connection_init -> connection_ack -> subscribe -> next.
 */
@Epic("TestFlow API")
@Feature("GraphQL subscriptions")
class GraphQLSubscriptionTest extends BaseApiTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SUBSCRIBE =
            "{\"id\":\"1\",\"type\":\"subscribe\",\"payload\":{\"query\":"
                    + "\"subscription($r: ID!) { runUpdates(runId: $r) { type testCaseId status runCompleted } }\","
                    + "\"variables\":{\"r\":\"%d\"}}}";

    private static String adminToken;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    private static WsClient openAndInit(String connectionParamsJson) throws Exception {
        WsClient ws = WsClient.connect("/graphql", "graphql-transport-ws");
        ws.send("{\"type\":\"connection_init\",\"payload\":" + connectionParamsJson + "}");
        assertThat(JSON.readTree(ws.nextFrame(TIMEOUT)).get("type").asText()).isEqualTo("connection_ack");
        return ws;
    }

    @Test
    void runUpdatesStreamsARestResultChange() throws Exception {
        int[] run = GraphQL.freshRun(adminToken);
        try (WsClient ws = openAndInit("{\"authToken\":\"" + adminToken + "\"}")) {
            ws.send(String.format(SUBSCRIBE, run[0]));
            // `ping` is answered in order after `subscribe` is processed, so once the pong
            // arrives the subscription is registered.
            ws.send("{\"type\":\"ping\"}");
            assertThat(JSON.readTree(ws.nextFrame(TIMEOUT)).get("type").asText()).isEqualTo("pong");
            Thread.sleep(200);

            given().header("Authorization", authHeader(adminToken))
                    .body(Map.of("status", "skip"))
                    .put("/api/runs/" + run[0] + "/results/" + run[1])
                    .then().statusCode(200);

            JsonNode next = JSON.readTree(ws.nextFrame(TIMEOUT));
            assertThat(next.get("type").asText()).isEqualTo("next");
            assertThat(next.get("id").asText()).isEqualTo("1");
            JsonNode event = next.at("/payload/data/runUpdates");
            assertThat(event.get("type").asText()).isEqualTo("result_updated");
            assertThat(event.get("testCaseId").asText()).isEqualTo(String.valueOf(run[1]));
            assertThat(event.get("status").asText()).isEqualTo("skip");
            assertThat(event.get("runCompleted").asBoolean()).isTrue();
        }
    }

    @Test
    void subscribingWithoutATokenIsUnauthenticated() throws Exception {
        int[] run = GraphQL.freshRun(adminToken);
        try (WsClient ws = openAndInit("{}")) {
            ws.send(String.format(SUBSCRIBE, run[0]));
            JsonNode msg = JSON.readTree(ws.nextFrame(TIMEOUT));
            // Execution errors arrive as `next` with `errors`; pre-execution ones as `error`.
            JsonNode errors = "error".equals(msg.get("type").asText()) ? msg.get("payload") : msg.at("/payload/errors");
            assertThat(errors.get(0).at("/extensions/code").asText()).isEqualTo("UNAUTHENTICATED");
        }
    }
}
