package com.testflow.e2e.support;

import java.util.UUID;

/** Unique-name helpers so repeated runs against a persistent server never collide. */
public final class TestData {

    public static final String RUN_ID = UUID.randomUUID().toString().substring(0, 8);

    private TestData() {
    }

    public static String uniqueName(String prefix) {
        return prefix + "-" + RUN_ID + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
