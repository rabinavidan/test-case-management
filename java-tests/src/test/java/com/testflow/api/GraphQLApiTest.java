package com.testflow.api;

import com.testflow.api.support.AuthSupport;
import com.testflow.api.support.BaseApiTest;
import com.testflow.api.support.GraphQL;
import com.testflow.api.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Black-box tests for the GraphQL API (/graphql) — the Java counterpart of
 * tests/api/test_graphql.py and e2e/tests/graphql.spec.ts. Schema: docs/schema.graphql.
 */
@Epic("TestFlow API")
@Feature("GraphQL")
class GraphQLApiTest extends BaseApiTest {

    private static final String CREATE_TREE_PROJECT = "mutation($n: String!) { createProject(input: {name: $n}) { id } }";
    private static final String CREATE_SUITE = "mutation($p: ID!) { createSuite(projectId: $p, input: {name: \"Suite\"}) { id } }";
    private static final String CREATE_CASE =
            "mutation($s: ID!, $t: String!) { createTestCase(suiteId: $s, input: {title: $t, status: ACTIVE, priority: HIGH}) { id } }";
    private static final String CREATE_RUN = "mutation($s: ID!) { createRun(suiteId: $s, input: {name: \"Java run\"}) { id } }";
    private static final String UPDATE_RESULT =
            "mutation($r: ID!, $t: ID!, $s: ResultStatus!) { updateResult(runId: $r, testCaseId: $t, input: {status: $s}) { status } }";

    private static String adminToken;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    private static String data(Response response, String path) {
        assertThat(response.jsonPath().getList("errors")).as("GraphQL errors").isNull();
        return response.jsonPath().getString("data." + path);
    }

    @Test
    void requestsWithoutATokenAreUnauthenticated() {
        Response response = GraphQL.post(null, "{ me { id } }");
        assertThat(response.jsonPath().getMap("data")).isNull();
        assertThat(GraphQL.errorCodes(response)).containsExactly("UNAUTHENTICATED");
    }

    @Test
    void meReturnsTheCaller() {
        assertThat(data(GraphQL.post(adminToken, "{ me { username role } }"), "me.role")).isEqualTo("admin");
    }

    @Test
    void mutationsBuildATreeThatOneNestedQueryReturns() {
        String projectId = data(GraphQL.post(adminToken, CREATE_TREE_PROJECT, Map.of("n", TestData.uniqueName("gql"))), "createProject.id");
        String suiteId = data(GraphQL.post(adminToken, CREATE_SUITE, Map.of("p", projectId)), "createSuite.id");
        String caseId = data(GraphQL.post(adminToken, CREATE_CASE, Map.of("s", suiteId, "t", "Java case")), "createTestCase.id");
        String runId = data(GraphQL.post(adminToken, CREATE_RUN, Map.of("s", suiteId)), "createRun.id");

        Response tree = GraphQL.post(adminToken,
                "query($p: ID!) { project(id: $p) { suites { testCases { id title priority } runs { id summary { total pending } } } } }",
                Map.of("p", projectId));

        assertThat(tree.jsonPath().getList("errors")).isNull();
        assertThat(tree.jsonPath().getString("data.project.suites[0].testCases[0].id")).isEqualTo(caseId);
        assertThat(tree.jsonPath().getString("data.project.suites[0].testCases[0].priority")).isEqualTo("high");
        assertThat(tree.jsonPath().getString("data.project.suites[0].runs[0].id")).isEqualTo(runId);
        assertThat(tree.jsonPath().getInt("data.project.suites[0].runs[0].summary.pending")).isEqualTo(1);
    }

    @Test
    void updateResultIsVisibleThroughRestAndTheRunSummary() {
        int[] run = GraphQL.freshRun(adminToken);
        String status = data(GraphQL.post(adminToken, UPDATE_RESULT,
                Map.of("r", String.valueOf(run[0]), "t", String.valueOf(run[1]), "s", "PASS")), "updateResult.status");
        assertThat(status).isEqualTo("pass");

        Response summary = GraphQL.post(adminToken, "query($r: ID!) { run(id: $r) { completedAt summary { passed passRate } } }",
                Map.of("r", String.valueOf(run[0])));
        assertThat(summary.jsonPath().getInt("data.run.summary.passed")).isEqualTo(1);
        assertThat(summary.jsonPath().getFloat("data.run.summary.passRate")).isEqualTo(100.0f);
        assertThat(summary.jsonPath().getString("data.run.completedAt")).isNotNull();

        given().header("Authorization", authHeader(adminToken))
                .get("/api/runs/" + run[0])
                .then().statusCode(200)
                .body("results[0].status", org.hamcrest.Matchers.equalTo("pass"));
    }

    @Test
    void executorsCannotRunAdminMutations() {
        Response response = GraphQL.post(AuthSupport.newExecutorToken(), CREATE_TREE_PROJECT, Map.of("n", "nope"));
        assertThat(GraphQL.errorCodes(response)).containsExactly("FORBIDDEN");
    }

    @Test
    void unknownParentIsNotFound() {
        Response response = GraphQL.post(adminToken, CREATE_SUITE, Map.of("p", "999999999"));
        assertThat(GraphQL.errorCodes(response)).containsExactly("NOT_FOUND");
    }

    @Test
    void invalidEnumValuesAreRejectedBeforeExecution() {
        Response response = GraphQL.post(adminToken, UPDATE_RESULT, Map.of("r", "1", "t", "1", "s", "PASSED"));
        assertThat(response.jsonPath().getMap("data")).isNull();
        assertThat(response.jsonPath().getString("errors[0].message")).contains("PASSED");
    }
}
