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

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow API")
@Feature("Test Suites")
class SuitesApiTest extends BaseApiTest {

    private static String adminToken;
    private int projectId;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @BeforeEach
    void createFreshProject() {
        projectId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("suites-project")))
                .post("/api/projects")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
    }

    @Test
    void adminCanCreateASuiteUnderAProject() {
        String name = TestData.uniqueName("suite");

        Response created = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", name, "description", "regression"))
                .post("/api/projects/" + projectId + "/suites");

        created.then().statusCode(201);
        assertThat(created.jsonPath().getInt("project_id")).isEqualTo(projectId);
        assertThat(created.jsonPath().getString("name")).isEqualTo(name);

        Response listed = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/projects/" + projectId + "/suites");

        listed.then().statusCode(200);
        assertThat(listed.jsonPath().getList("name", String.class)).contains(name);
    }

    @Test
    void creatingASuiteUnderAMissingProjectReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("suite")))
                .post("/api/projects/999999999/suites")
                .then().statusCode(404);
    }

    @Test
    void nonAdminCannotCreateASuite() {
        String executorToken = AuthSupport.newExecutorToken();

        given()
                .header("Authorization", authHeader(executorToken))
                .body(Map.of("name", TestData.uniqueName("suite")))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(403);
    }

    @Test
    void deletingASuiteRemovesIt() {
        int suiteId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("suite-to-delete")))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/suites/" + suiteId)
                .then().statusCode(204);

        given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/suites/" + suiteId + "/testcases")
                .then().statusCode(404);
    }

    @Test
    void deletingASuiteThatDoesNotExistReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/suites/999999999")
                .then().statusCode(404);
    }
}
