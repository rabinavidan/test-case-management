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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Black-box tests for the run-collaboration WebSocket, /ws/runs/{id} — the Java counterpart of
 * tests/api/test_websocket.py and e2e/tests/realtime.spec.ts. Contract: docs/asyncapi.yaml.
 */
@Epic("TestFlow API")
@Feature("Live run WebSocket")
class RunWebSocketTest extends BaseApiTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final ObjectMapper JSON = new ObjectMapper();

    private static String adminToken;
    private int runId;
    private int testCaseId;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @BeforeEach
    void createRun() {
        int[] run = GraphQL.freshRun(adminToken);
        runId = run[0];
        testCaseId = run[1];
    }

    private String url(int run) {
        return "/ws/runs/" + run + "?token=" + adminToken;
    }

    @Test
    void jsonPingGetsATimestampedPong() throws Exception {
        try (WsClient ws = WsClient.connect(url(runId))) {
            long before = System.currentTimeMillis() / 1000;
            ws.send("{\"type\":\"ping\"}");
            JsonNode pong = JSON.readTree(ws.nextFrame(TIMEOUT));
            assertThat(pong.get("type").asText()).isEqualTo("pong");
            assertThat(pong.get("ts").asLong()).isGreaterThanOrEqualTo(before);
        }
    }

    @Test
    void legacyTextPingStillGetsPong() {
        try (WsClient ws = WsClient.connect(url(runId))) {
            ws.send("ping");
            assertThat(ws.nextFrame(TIMEOUT)).isEqualTo("pong");
        }
    }

    @Test
    void aMalformedFrameGetsAnErrorAndTheSocketStaysOpen() throws Exception {
        try (WsClient ws = WsClient.connect(url(runId))) {
            ws.send("{not json");
            JsonNode error = JSON.readTree(ws.nextFrame(TIMEOUT));
            assertThat(error.get("type").asText()).isEqualTo("error");
            assertThat(error.get("detail").asText()).contains("JSON");

            ws.send("ping");
            assertThat(ws.nextFrame(TIMEOUT)).isEqualTo("pong");
        }
    }

    @ParameterizedTest(name = "query \"{0}\" -> 4401")
    @ValueSource(strings = {"", "?token=", "?token=not-a-jwt", "?token=a.b.c"})
    void missingOrInvalidTokenClosesWith4401(String query) {
        try (WsClient ws = WsClient.connect("/ws/runs/" + runId + query)) {
            assertThat(ws.awaitCloseCode(TIMEOUT)).isEqualTo(4401);
        }
    }

    @Test
    void unknownRunClosesWith4404() {
        try (WsClient ws = WsClient.connect(url(999_999_999))) {
            assertThat(ws.awaitCloseCode(TIMEOUT)).isEqualTo(4404);
        }
    }

    @Test
    void aRestResultUpdateIsBroadcastToTheRunsRoom() throws Exception {
        try (WsClient ws = WsClient.connect(url(runId))) {
            // Round-trip first so the socket is certainly in the room before the write.
            ws.send("ping");
            assertThat(ws.nextFrame(TIMEOUT)).isEqualTo("pong");

            given()
                    .header("Authorization", authHeader(adminToken))
                    .body(Map.of("status", "fail", "notes", "seen from Java"))
                    .put("/api/runs/" + runId + "/results/" + testCaseId)
                    .then().statusCode(200);

            JsonNode event = JSON.readTree(ws.nextFrame(TIMEOUT));
            assertThat(event.get("type").asText()).isEqualTo("result_updated");
            assertThat(event.get("testcase_id").asInt()).isEqualTo(testCaseId);
            assertThat(event.get("status").asText()).isEqualTo("fail");
            assertThat(event.get("notes").asText()).isEqualTo("seen from Java");
            assertThat(event.get("run_completed").asBoolean()).isTrue();
        }
    }
}
