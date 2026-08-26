package com.testflow.api.support;

import io.restassured.response.Response;

import static io.restassured.RestAssured.given;

/**
 * Bootstraps auth tokens against a live TestFlow instance.
 *
 * <p>{@code POST /api/auth/register} only ever succeeds for the very first user created on a
 * given database — after that it 403s and every other user is created via
 * {@code POST /api/users}, which always assigns the "executor" role. So there is exactly one
 * admin account per server, and this suite shares the same bootstrap username/password as
 * {@code e2e/global-setup.ts} ("register, ignore failure if it already exists, then log in") so
 * the Java, TypeScript and pytest-e2e stacks can all run against the same live instance without
 * fighting over who gets to be the first user.
 */
public final class AuthSupport {

    private static final String BASE_URL =
            System.getProperty("baseUrl", System.getenv().getOrDefault("BASE_URL", "http://localhost:8000"));

    private static final String ADMIN_USERNAME = "testuser_e2e";
    private static final String ADMIN_PASSWORD = "Test@12345";
    private static final String ADMIN_EMAIL = "e2e@test.com";

    private static volatile String adminToken;

    private AuthSupport() {
    }

    /** Token for the shared bootstrap admin account, registering it first if the DB is empty. */
    public static synchronized String adminToken() {
        if (adminToken != null) {
            return adminToken;
        }
        given().baseUri(BASE_URL)
                .contentType("application/json")
                .body(java.util.Map.of(
                        "username", ADMIN_USERNAME,
                        "email", ADMIN_EMAIL,
                        "password", ADMIN_PASSWORD))
                .post("/api/auth/register");
        // Ignore the response: 201 the first time, 403 ("registration closed") every time after —
        // either way the account exists now, so log in.

        Response login = given().baseUri(BASE_URL)
                .contentType("application/json")
                .body(java.util.Map.of("username", ADMIN_USERNAME, "password", ADMIN_PASSWORD))
                .post("/api/auth/login");

        if (login.statusCode() != 200) {
            throw new IllegalStateException(
                    "Could not obtain admin token (bootstrap account may be owned by a different "
                            + "password on this server): " + login.statusCode() + " " + login.asString());
        }
        adminToken = login.jsonPath().getString("access_token");
        return adminToken;
    }

    /** Creates a brand-new executor (non-admin) user and returns their token. */
    public static String newExecutorToken() {
        return newExecutor()[1];
    }

    /** Creates a brand-new executor user and returns {username, token}. */
    public static String[] newExecutor() {
        String username = TestData.uniqueName("executor");
        given().baseUri(BASE_URL)
                .contentType("application/json")
                .header("Authorization", "Bearer " + adminToken())
                .body(java.util.Map.of(
                        "username", username,
                        "email", username + "@testflow.local",
                        "password", "Executor@12345"))
                .post("/api/users")
                .then().statusCode(201);

        Response login = given().baseUri(BASE_URL)
                .contentType("application/json")
                .body(java.util.Map.of("username", username, "password", "Executor@12345"))
                .post("/api/auth/login");
        login.then().statusCode(200);
        return new String[] {username, login.jsonPath().getString("access_token")};
    }
}
