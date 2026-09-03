package com.testflow.e2e.support;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Tracing;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Base for every browser test: one {@link Browser} per JVM (shared across test classes,
 * Playwright's recommended pattern for speed), a fresh {@link BrowserContext}/{@link Page} per
 * test for isolation — mirroring how {@code e2e/playwright.config.ts} isolates specs.
 *
 * <p>Every context records video and a trace; {@link FailureArtifactsExtension} keeps those
 * (plus a screenshot) only for tests that fail, discarding them otherwise — the same
 * "only-on-failure" / "retain-on-failure" policy {@code e2e/playwright.config.ts} uses, since
 * Playwright-for-Java + JUnit 5 has no built-in equivalent of the JS test runner's config.
 */
@ExtendWith(FailureArtifactsExtension.class)
public abstract class BaseTest {

    protected static final boolean HEADED = Boolean.getBoolean("headed");
    static final Path ARTIFACTS_DIR = Paths.get("target", "test-results");
    static final Path VIDEO_TMP_DIR = ARTIFACTS_DIR.resolve("video-tmp");

    private static Playwright playwright;
    private static Browser browser;

    protected BrowserContext context;
    protected Page page;

    @BeforeAll
    static void launchBrowser() {
        // On a genuinely fresh database, the app auto-opens a full-screen "first-time setup"
        // modal on load (GET /api/auth/setup -> setup_needed) that blocks every other UI
        // interaction, including the sign-in button LoginTest drives directly. Registering the
        // bootstrap admin here — before any test's page ever loads — guarantees setup is already
        // done no matter which test class runs first, the same ordering guarantee
        // e2e/global-setup.ts gives the TypeScript suite by running once before every spec.
        ApiClient.adminToken();

        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(!HEADED));
    }

    @AfterAll
    static void closeBrowser() {
        browser.close();
        playwright.close();
    }

    @BeforeEach
    void newContext(TestInfo testInfo) throws java.io.IOException {
        String testName = testInfo.getTestClass().map(Class::getSimpleName).orElse("Unknown")
                + "-" + testInfo.getTestMethod().map(m -> m.getName()).orElse(testInfo.getDisplayName());
        Path videoDir = VIDEO_TMP_DIR.resolve(testName);
        java.nio.file.Files.createDirectories(videoDir);

        context = browser.newContext(new Browser.NewContextOptions()
                .setBaseURL(ApiClient.BASE_URL)
                .setRecordVideoDir(videoDir));
        context.tracing().start(new Tracing.StartOptions()
                .setScreenshots(true)
                .setSnapshots(true)
                .setSources(true));
        page = context.newPage();
    }

    // Context/page lifecycle (including closing, which flushes the recorded video) is owned by
    // FailureArtifactsExtension so it can capture failure artifacts before teardown.

    /** Injects the bootstrap admin's token into localStorage before the app's first load. */
    protected void signInAs(String token) {
        context.addInitScript("localStorage.setItem('tf_token', '" + token + "');");
    }
}
