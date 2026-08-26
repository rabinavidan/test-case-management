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
@Feature("User Management")
class UsersApiTest extends BaseApiTest {

    private static String adminToken;

    @BeforeAll
    static void authenticate() {
        adminToken = AuthSupport.adminToken();
    }

    @Test
    void adminCanCreateAndListExecutorUsers() {
        String[] executor = AuthSupport.newExecutor();
        String username = executor[0];

        Response listed = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/users");

        listed.then().statusCode(200);
        assertThat(listed.jsonPath().getList("username", String.class)).contains(username);
    }

    @Test
    void nonAdminCannotListUsers() {
        String executorToken = AuthSupport.newExecutorToken();

        given()
                .header("Authorization", authHeader(executorToken))
                .get("/api/users")
                .then().statusCode(403);
    }

    @Test
    void adminCanToggleAnExecutorsActiveStatus() {
        String username = TestData.uniqueName("toggle-user");
        int userId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("username", username, "email", username + "@testflow.local", "password", "Toggle@12345"))
                .post("/api/users")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        Response toggled = given()
                .header("Authorization", authHeader(adminToken))
                .patch("/api/users/" + userId + "/status");

        toggled.then().statusCode(200);
        assertThat(toggled.jsonPath().getBoolean("is_active")).isFalse();
    }

    @Test
    void adminCannotDeleteTheirOwnAccount() {
        Response me = given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/auth/me");
        int selfId = me.jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/users/" + selfId)
                .then().statusCode(400);
    }

    @Test
    void deletingAUserThatDoesNotExistReturns404() {
        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/users/999999999")
                .then().statusCode(404);
    }

    @Test
    void adminCanDeleteAnExecutorUser() {
        String username = TestData.uniqueName("deletable-user");
        int userId = given()
                .header("Authorization", authHeader(adminToken))
                .body(Map.of("username", username, "email", username + "@testflow.local", "password", "Delete@12345"))
                .post("/api/users")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", authHeader(adminToken))
                .delete("/api/users/" + userId)
                .then().statusCode(204);

        given()
                .header("Authorization", authHeader(adminToken))
                .get("/api/users")
                .then().statusCode(200)
                .body("id", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(userId)));
    }
}
