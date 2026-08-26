package com.testflow.api.support;

import io.qameta.allure.restassured.AllureRestAssured;
import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import org.junit.jupiter.api.BeforeAll;

/**
 * Base for every black-box API test: points REST Assured at a running TestFlow instance
 * (monolith or microservices — the public /api surface is identical in both, per the
 * root README) and registers the Allure filter so every request/response is attached
 * to the report, same as the Python/TypeScript stacks.
 */
public abstract class BaseApiTest {

    protected static final String BASE_URL =
            System.getProperty("baseUrl", System.getenv().getOrDefault("BASE_URL", "http://localhost:8000"));

    @BeforeAll
    static void configureRestAssured() {
        RestAssured.baseURI = BASE_URL;
        RestAssured.requestSpecification = new RequestSpecBuilder()
                .setContentType("application/json")
                .addFilter(new AllureRestAssured())
                .build();
    }

    protected static String authHeader(String token) {
        return "Bearer " + token;
    }
}
