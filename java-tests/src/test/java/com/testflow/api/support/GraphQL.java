package com.testflow.api.support;

import io.restassured.response.Response;

import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;

/**
 * POST /graphql through REST Assured (so requests land in the Allure report like every other
 * call). GraphQL answers 200 even for errors — callers assert on {@code data} / {@code errors}.
 */
public final class GraphQL {

    private GraphQL() {
    }

    public static Response post(String token, String query, Map<String, ?> variables) {
        var request = given().body(Map.of("query", query, "variables", variables));
        if (token != null) {
            request = request.header("Authorization", "Bearer " + token);
        }
        Response response = request.post("/graphql");
        response.then().statusCode(200);
        return response;
    }

    public static Response post(String token, String query) {
        return post(token, query, Map.of());
    }

    public static List<String> errorCodes(Response response) {
        return response.jsonPath().getList("errors.extensions.code", String.class);
    }

    /** A run over one active test case, created through REST: {runId, testCaseId}. */
    public static int[] freshRun(String adminToken) {
        Fixtures.ActiveCaseSuite fixture = Fixtures.suiteWithOneActiveTestCase(adminToken);
        int runId = given()
                .header("Authorization", "Bearer " + adminToken)
                .body(Map.of("name", TestData.uniqueName("live-run")))
                .post("/api/suites/" + fixture.suiteId() + "/runs")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
        return new int[] {runId, fixture.activeTestCaseId()};
    }
}
