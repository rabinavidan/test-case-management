package com.testflow.e2e.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

/**
 * Thin JDK {@link HttpClient} wrapper used to seed and tear down test data through the API
 * ("drive setup through the API, assert through the UI") — the same pattern the TypeScript
 * suite's specs use via Playwright's {@code request} fixture.
 *
 * <p>{@code POST /api/auth/register} only ever succeeds for the very first user on a given
 * database; every stack (Python, TypeScript, this one, and java-tests/) shares the same
 * bootstrap username/password (see {@code e2e/global-setup.ts}) so they can all run against one
 * live instance without racing to become the first user.
 */
public final class ApiClient {

    public static final String BASE_URL =
            System.getProperty("baseUrl", System.getenv().getOrDefault("BASE_URL", "http://localhost:8000"));

    private static final String ADMIN_USERNAME = "testuser_e2e";
    private static final String ADMIN_PASSWORD = "Test@12345";
    private static final String ADMIN_EMAIL = "e2e@test.com";

    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final ObjectMapper JSON = new ObjectMapper();

    private static volatile String adminToken;

    private ApiClient() {
    }

    public static synchronized String adminToken() {
        if (adminToken != null) {
            return adminToken;
        }
        postJson("/api/auth/register", Map.of(
                "username", ADMIN_USERNAME, "email", ADMIN_EMAIL, "password", ADMIN_PASSWORD), null);
        // Ignore the response: 201 the first time, 403 ("registration closed") every time after.

        JsonNode login = postJson("/api/auth/login",
                Map.of("username", ADMIN_USERNAME, "password", ADMIN_PASSWORD), null);
        adminToken = login.get("access_token").asText();
        return adminToken;
    }

    public static int createProject(String name, String description) {
        JsonNode body = description == null
                ? postJson("/api/projects", Map.of("name", name), adminToken())
                : postJson("/api/projects", Map.of("name", name, "description", description), adminToken());
        return body.get("id").asInt();
    }

    public static int createSuite(int projectId, String name) {
        JsonNode body = postJson("/api/projects/" + projectId + "/suites", Map.of("name", name), adminToken());
        return body.get("id").asInt();
    }

    public static int createTestCase(int suiteId, String title, String status) {
        JsonNode body = postJson("/api/suites/" + suiteId + "/testcases",
                Map.of("title", title, "status", status, "priority", "medium"), adminToken());
        return body.get("id").asInt();
    }

    /** Looks up a project's id by name — used to find what a UI-driven create just made. */
    public static int findProjectIdByName(String name) {
        try {
            HttpRequest req = HttpRequest.newBuilder(
                            URI.create(BASE_URL + "/api/projects?search=" + java.net.URLEncoder.encode(name, java.nio.charset.StandardCharsets.UTF_8)))
                    .header("Authorization", "Bearer " + adminToken())
                    .GET()
                    .build();
            HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            for (JsonNode item : JSON.readTree(res.body()).get("items")) {
                if (item.get("name").asText().equals(name)) {
                    return item.get("id").asInt();
                }
            }
            throw new IllegalStateException("No project named '" + name + "' found");
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Lookup for project '" + name + "' failed", e);
        }
    }

    public static void deleteProject(int projectId) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(BASE_URL + "/api/projects/" + projectId))
                    .header("Authorization", "Bearer " + adminToken())
                    .DELETE()
                    .build();
            HTTP.send(req, HttpResponse.BodyHandlers.discarding());
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static JsonNode postJson(String path, Map<String, String> body, String token) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(BASE_URL + path))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
            if (token != null) {
                builder.header("Authorization", "Bearer " + token);
            }
            HttpResponse<String> res = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return JSON.readTree(res.body().isBlank() ? "{}" : res.body());
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Request to " + path + " failed", e);
        }
    }
}
