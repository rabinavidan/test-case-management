package com.testflow.api;

import com.testflow.api.support.AuthSupport;
import com.testflow.api.support.BaseApiTest;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow API")
@Feature("Auth")
class AuthApiTest extends BaseApiTest {

    @Test
    void versionEndpointReportsAVersionString() {
        given()
                .when().get("/api/version")
                .then().statusCode(200)
                .body("version", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    void loginWithValidCredentialsReturnsATokenAndTheUser() {
        String token = AuthSupport.adminToken();

        Response me = given()
                .header("Authorization", authHeader(token))
                .when().get("/api/auth/me");

        me.then().statusCode(200);
        assertThat(me.jsonPath().getString("role")).isEqualTo("admin");
        assertThat(me.jsonPath().getBoolean("is_active")).isTrue();
    }

    @Test
    void loginWithWrongPasswordIsRejected() {
        given()
                .body(Map.of("username", "testuser_e2e", "password", "definitely-not-the-password"))
                .when().post("/api/auth/login")
                .then().statusCode(401);
    }

    @Test
    void loginWithUnknownUsernameIsRejected() {
        given()
                .body(Map.of("username", "no-such-user-" + System.nanoTime(), "password", "whatever123"))
                .when().post("/api/auth/login")
                .then().statusCode(401);
    }

    @Test
    void meWithoutATokenIsUnauthorized() {
        given()
                .when().get("/api/auth/me")
                .then().statusCode(401);
    }

    @Test
    void meWithAMalformedTokenIsUnauthorized() {
        given()
                .header("Authorization", "Bearer not-a-real-jwt")
                .when().get("/api/auth/me")
                .then().statusCode(401);
    }
}
