package com.testflow.api.support;

import java.util.Map;

import static io.restassured.RestAssured.given;

/**
 * Object Mother for the project → suite → test-case object graph. Every API test class used to
 * hand-roll its own version of "create a fresh project" / "create a fresh suite" in a
 * {@code @BeforeEach} (see the git history of {@code SuitesApiTest}, {@code TestCasesApiTest},
 * {@code RunsApiTest} before this class existed) — three independent copies of the same three
 * REST calls. This centralizes them so a test class asks for the shape of data it needs instead
 * of re-deriving it.
 */
public final class Fixtures {

    private Fixtures() {
    }

    /** A freshly created project and, under it, a freshly created suite. */
    public record Suite(int projectId, int suiteId) {
    }

    /** A fresh suite with exactly one test case in it, already flipped to "active". */
    public record ActiveCaseSuite(int projectId, int suiteId, int activeTestCaseId) {
    }

    public static int freshProject(String adminToken) {
        return freshProject(adminToken, "project");
    }

    public static int freshProject(String adminToken, String namePrefix) {
        return given()
                .header("Authorization", "Bearer " + adminToken)
                .body(Map.of("name", TestData.uniqueName(namePrefix)))
                .post("/api/projects")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
    }

    public static Suite freshSuite(String adminToken) {
        return freshSuite(adminToken, "project", "suite");
    }

    public static Suite freshSuite(String adminToken, String projectPrefix, String suitePrefix) {
        int projectId = freshProject(adminToken, projectPrefix);
        int suiteId = given()
                .header("Authorization", "Bearer " + adminToken)
                .body(Map.of("name", TestData.uniqueName(suitePrefix)))
                .post("/api/projects/" + projectId + "/suites")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");
        return new Suite(projectId, suiteId);
    }

    /**
     * A fresh suite containing one draft test case (left in draft on purpose — it must never be
     * picked up by a run) and one active test case, returning the active one's id.
     */
    public static ActiveCaseSuite suiteWithOneActiveTestCase(String adminToken) {
        Suite suite = freshSuite(adminToken);

        given()
                .header("Authorization", "Bearer " + adminToken)
                .body(TestCasePayload.testCase().title("draft case — excluded from runs").toMap())
                .post("/api/suites/" + suite.suiteId() + "/testcases")
                .then().statusCode(201);

        int activeTestCaseId = given()
                .header("Authorization", "Bearer " + adminToken)
                .body(TestCasePayload.testCase().title("active case — included in runs").toMap())
                .post("/api/suites/" + suite.suiteId() + "/testcases")
                .then().statusCode(201)
                .extract().jsonPath().getInt("id");

        given()
                .header("Authorization", "Bearer " + adminToken)
                .body(TestCasePayload.testCase().status("active").toMap())
                .put("/api/testcases/" + activeTestCaseId)
                .then().statusCode(200);

        return new ActiveCaseSuite(suite.projectId(), suite.suiteId(), activeTestCaseId);
    }
}
