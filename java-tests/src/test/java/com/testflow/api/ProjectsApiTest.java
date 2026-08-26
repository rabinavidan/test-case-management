package com.testflow.api;

import com.testflow.api.support.AuthSupport;
import com.testflow.api.support.BaseApiTest;
import com.testflow.api.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow API")
@Feature("Projects")
class ProjectsApiTest extends BaseApiTest {

    private static String adminToken;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @Test
    void adminCanCreateAProjectAndSeeItInTheList() {
        String name = TestData.uniqueName("project");

        Response created = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", name, "description", "created by the Java API suite"))
                .post("/api/projects");

        created.then().statusCode(201);
        int projectId = created.jsonPath().getInt("id");
        assertThat(created.jsonPath().getString("name")).isEqualTo(name);

        Response listed = given()
                .header("Authorization", authHeader(adminToken))
                .queryParam("search", name)
                .get("/api/projects");

        listed.then().statusCode(200);
        assertThat(listed.jsonPath().getList("items.id", Integer.class)).contains(projectId);
    }

    @Test
    void projectListIsAPaginationEnvelope() {
        Response res = given()
                .header("Authorization", authHeader(adminToken))
                .queryParam("page", 1)
                .queryParam("page_size", 5)
                .get("/api/projects");

        res.then().statusCode(200)
                .body("page", org.hamcrest.Matchers.equalTo(1))
                .body("page_size", org.hamcrest.Matchers.equalTo(5))
                .body("$", org.hamcrest.Matchers.hasKey("total"))
                .body("$", org.hamcrest.Matchers.hasKey("total_pages"))
                .body("items.size()", org.hamcrest.Matchers.lessThanOrEqualTo(5));
    }

    @Test
    void nonAdminCannotCreateAProject() {
        String executorToken = AuthSupport.newExecutorToken();

        given()
                .header("Authorization", authHeader(executorToken))
                .body(Map.of("name", TestData.uniqueName("project")))
                .post("/api/projects")
                .then().statusCode(403);
    }

    @Test
    void creatingAProjectWithoutAuthIsUnauthorized() {
        given()
                .body(Map.of("name", TestData.uniqueName("project")))
                .post("/api/projects")
                .then().statusCode(401);
    }

    @Test
    void deletingAProjectRemovesItAndCascadesToItsSuites() {
        int projectId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", TestData.uniqueName("project-to-delete")))
                .post("/api/projects")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("name", "suite in a project about to be deleted"))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(201);

        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/projects/" + projectId)
                .then().statusCode(204);

        // The project (and, by cascade, the suite created under it) is gone.
        given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/projects/" + projectId + "/suites")
                .then().statusCode(404);
    }

    @Test
    void deletingAProjectThatDoesNotExistReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/projects/999999999")
                .then().statusCode(404);
    }
}
