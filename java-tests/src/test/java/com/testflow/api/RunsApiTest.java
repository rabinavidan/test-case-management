package com.testflow.api;

import com.testflow.api.support.AuthSupport;
import com.testflow.api.support.BaseApiTest;
import com.testflow.api.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow API")
@Feature("Test Runs")
class RunsApiTest extends BaseApiTest {

    private static String adminToken;
    private int suiteId;
    private int activeTestCaseId;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @BeforeEach
    void createSuiteWithOneActiveTestCase() {
        int projectId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("runs-project")))
                .post("/api/projects")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        suiteId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("runs-suite")))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        int draftTestCaseId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("title", "draft case — excluded from runs"))
                .post("/api/suites/" + suiteId + "/testcases")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        activeTestCaseId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("title", "active case — included in runs"))
                .post("/api/suites/" + suiteId + "/testcases")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("status", "active"))
                .put("/api/testcases/" + activeTestCaseId)
                .then().statusCode(200);
        // draftTestCaseId stays in "draft" status on purpose — a run must not pick it up.
        assertThat(draftTestCaseId).isNotEqualTo(activeTestCaseId);
    }

    @Test
    void creatingARunSeedsPendingResultsForActiveTestCasesOnly() {
        Response run = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("run")))
                .post("/api/suites/" + suiteId + "/runs");

        run.then().statusCode(201);
        List<Integer> testcaseIds = run.jsonPath().getList("results.testcase_id", Integer.class);
        assertThat(testcaseIds).containsExactly(activeTestCaseId);
        assertThat(run.jsonPath().getList("results.status", String.class)).containsExactly("pending");
        // The create-run response includes the field but never populates it (only the
        // schema's from_orm_with_user helper would, and no route calls it) — matches the
        // Python suite's tests/api/test_runs.py::test_create_run_response_includes_created_by_field.
        java.util.Map<String, Object> body = run.jsonPath().getMap("$");
        assertThat(body).containsKey("created_by_username");
    }

    @Test
    void runsUnderASuiteAreListedAndFetchableById() {
        int runId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("run")))
                .post("/api/suites/" + suiteId + "/runs")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/suites/" + suiteId + "/runs")
                .then().statusCode(200)
                .body("id", org.hamcrest.Matchers.hasItem(runId));

        given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/runs/" + runId)
                .then().statusCode(200)
                .body("id", org.hamcrest.Matchers.equalTo(runId));
    }

    @Test
    void updatingTheOnlyResultCompletesTheRun() {
        int runId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("run")))
                .post("/api/suites/" + suiteId + "/runs")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("status", "pass", "notes", "looks good"))
                .put("/api/runs/" + runId + "/results/" + activeTestCaseId)
                .then().statusCode(200)
                .body("status", org.hamcrest.Matchers.equalTo("pass"));

        Response run = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/runs/" + runId);

        run.then().statusCode(200);
        assertThat(run.jsonPath().getString("completed_at")).isNotNull();
    }

    @Test
    void updatingAResultForAMissingRunOrTestCaseReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("status", "pass"))
                .put("/api/runs/999999999/results/" + activeTestCaseId)
                .then().statusCode(404);
    }

    @Test
    void creatingARunUnderAMissingSuiteReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", "run"))
                .post("/api/suites/999999999/runs")
                .then().statusCode(404);
    }
}
