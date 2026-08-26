package com.testflow.e2e.support;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;

/**
 * Base for every browser test: one {@link Browser} per JVM (shared across test classes,
 * Playwright's recommended pattern for speed), a fresh {@link BrowserContext}/{@link Page} per
 * test for isolation — mirroring how {@code e2e/playwright.config.ts} isolates specs.
 */
public abstract class BaseTest {

    protected static final boolean HEADED = Boolean.getBoolean("headed");

    private static Playwright playwright;
    private static Browser browser;

    protected BrowserContext context;
    protected Page page;

    @BeforeAll
    static void launchBrowser() {
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(!HEADED));
    }

    @AfterAll
    static void closeBrowser() {
        browser.close();
        playwright.close();
    }

    @BeforeEach
    void newContext() {
        context = browser.newContext(new Browser.NewContextOptions().setBaseURL(ApiClient.BASE_URL));
        page = context.newPage();
    }

    @AfterEach
    void closeContext() {
        context.close();
    }

    /** Injects the bootstrap admin's token into localStorage before the app's first load. */
    protected void signInAs(String token) {
        context.addInitScript("localStorage.setItem('tf_token', '" + token + "');");
    }
}
