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

import java.util.Map;
import java.util.HashMap;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow API")
@Feature("Test Cases")
class TestCasesApiTest extends BaseApiTest {

    private static String adminToken;
    private int suiteId;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @BeforeEach
    void createFreshSuite() {
        int projectId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("tc-project")))
                .post("/api/projects")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        suiteId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("tc-suite")))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
    }

    private int createTestCase(String title) {
        return given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("title", title))
                .post("/api/suites/" + suiteId + "/testcases")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
    }

    @Test
    void newTestCaseDefaultsToDraftStatusAndMediumPriority() {
        Response created = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("title", TestData.uniqueName("case")))
                .post("/api/suites/" + suiteId + "/testcases");

        created.then().statusCode(201);
        assertThat(created.jsonPath().getString("status")).isEqualTo("draft");
        assertThat(created.jsonPath().getString("priority")).isEqualTo("medium");
        assertThat(created.jsonPath().getInt("suite_id")).isEqualTo(suiteId);
    }

    @Test
    void testCasesUnderASuiteAreListed() {
        String title = TestData.uniqueName("listed-case");
        createTestCase(title);

        Response listed = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/suites/" + suiteId + "/testcases");

        listed.then().statusCode(200);
        assertThat(listed.jsonPath().getList("title", String.class)).contains(title);
    }

    @Test
    void updatingATestCaseChangesOnlyTheSuppliedFields() {
        int tcId = createTestCase(TestData.uniqueName("case"));

        Response updated = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("status", "active", "priority", "high"))
                .put("/api/testcases/" + tcId);

        updated.then().statusCode(200);
        assertThat(updated.jsonPath().getString("status")).isEqualTo("active");
        assertThat(updated.jsonPath().getString("priority")).isEqualTo("high");
    }

    @Test
    void anExplicitNullForANonNullableFieldDoesNotClearIt() {
        // Regression test for the bug documented in api/main.py's update_testcase:
        // title/status/priority are non-nullable in the response, so an explicit
        // `null` (distinct from omitting the field) must be ignored, not applied.
        int tcId = createTestCase(TestData.uniqueName("case"));

        Map<String, Object> payload = new HashMap<>();
        payload.put("status", "active");
        payload.put("title", null);

        Response updated = given()
                .header("Authorization", authHeader(adminToken))
                .body(payload)
                .put("/api/testcases/" + tcId);

        updated.then().statusCode(200);
        assertThat(updated.jsonPath().getString("title")).isNotNull();
        assertThat(updated.jsonPath().getString("status")).isEqualTo("active");
    }

    @Test
    void deletingATestCaseRemovesItFromTheList() {
        int tcId = createTestCase(TestData.uniqueName("case-to-delete"));

        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/testcases/" + tcId)
                .then().statusCode(204);

        Response listed = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/suites/" + suiteId + "/testcases");

        assertThat(listed.jsonPath().getList("id", Integer.class)).doesNotContain(tcId);
    }

    @Test
    void creatingATestCaseUnderAMissingSuiteReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("title", TestData.uniqueName("case")))
                .post("/api/suites/999999999/testcases")
                .then().statusCode(404);
    }

    @Test
    void nonAdminCannotUpdateATestCase() {
        int tcId = createTestCase(TestData.uniqueName("case"));
        String executorToken = AuthSupport.newExecutorToken();

        given()
                .header("Authorization", authHeader(executorToken))
                .body(Map.of("status", "active"))
                .put("/api/testcases/" + tcId)
                .then().statusCode(403);
    }
}
