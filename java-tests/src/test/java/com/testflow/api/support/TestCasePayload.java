package com.testflow.api.support;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fluent builder for test-case request bodies. Create and update share the same fields
 * (see {@code shared/schemas.py}'s {@code TestCaseCreate}/{@code TestCaseUpdate} — title is
 * required on create, everything else optional on both), so one builder serves both: only
 * fields that were actually set are included in {@link #toMap()}, matching the API's
 * partial-update semantics (an omitted field is left alone; only explicitly setting a field
 * to {@code null}, e.g. via {@link #title(String)}, sends an explicit JSON null).
 */
public final class TestCasePayload {

    private final Map<String, Object> fields = new LinkedHashMap<>();

    private TestCasePayload() {
    }

    public static TestCasePayload testCase() {
        return new TestCasePayload();
    }

    public TestCasePayload title(String title) {
        fields.put("title", title);
        return this;
    }

    /** Title unique to this JVM run — the common case of "just give me a valid test case". */
    public TestCasePayload uniqueTitle(String prefix) {
        return title(TestData.uniqueName(prefix));
    }

    public TestCasePayload description(String description) {
        fields.put("description", description);
        return this;
    }

    public TestCasePayload steps(String steps) {
        fields.put("steps", steps);
        return this;
    }

    public TestCasePayload expectedResult(String expectedResult) {
        fields.put("expected_result", expectedResult);
        return this;
    }

    public TestCasePayload status(String status) {
        fields.put("status", status);
        return this;
    }

    public TestCasePayload priority(String priority) {
        fields.put("priority", priority);
        return this;
    }

    public Map<String, Object> toMap() {
        return fields;
    }
}
