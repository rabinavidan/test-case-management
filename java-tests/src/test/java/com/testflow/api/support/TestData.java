package com.testflow.api.support;

import java.util.UUID;

/** Unique-name helpers so repeated runs against a persistent server (SQLite/Postgres) never collide. */
public final class TestData {

    /** One id per JVM run — shared by every generated name so a run's data is easy to spot/clean up. */
    public static final String RUN_ID = UUID.randomUUID().toString().substring(0, 8);

    private TestData() {
    }

    public static String uniqueName(String prefix) {
        return prefix + "-" + RUN_ID + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
