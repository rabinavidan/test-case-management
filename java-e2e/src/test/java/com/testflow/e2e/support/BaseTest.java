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
 * Base for every browser test: one {@link Browser} per JUnit 5 execution thread (see
 * {@code junit-platform.properties} — test classes run concurrently, each pinned to one thread
 * for its whole lifecycle, so a thread-local browser is one-per-class in practice without a
 * shared static field multiple classes could race on), a fresh {@link BrowserContext}/{@link Page}
 * per test for isolation — mirroring how {@code e2e/playwright.config.ts} isolates specs.
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

    // A plain `private static Browser browser` here would be one field shared by every
    // subclass (static fields live on the declaring class, not per-subclass) — under
    // concurrent test-class execution, one class's @AfterAll closing "the" browser could pull
    // it out from under another class's still-running tests. ThreadLocal gives each execution
    // thread (== each concurrently-running class, under the classes-concurrent/methods-same_thread
    // mode junit-platform.properties configures) its own private instance instead.
    private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
    private static final ThreadLocal<Browser> BROWSER = new ThreadLocal<>();

    protected BrowserContext context;
    protected Page page;
    protected Pages pages;

    @BeforeAll
    static void launchBrowser() {
        // On a genuinely fresh database, the app auto-opens a full-screen "first-time setup"
        // modal on load (GET /api/auth/setup -> setup_needed) that blocks every other UI
        // interaction, including the sign-in button LoginTest drives directly. Registering the
        // bootstrap admin here — before any test's page ever loads — guarantees setup is already
        // done no matter which test class runs first, the same ordering guarantee
        // e2e/global-setup.ts gives the TypeScript suite by running once before every spec.
        // Safe under concurrent classes: ApiClient.adminToken() is synchronized and memoized.
        ApiClient.adminToken();

        Playwright playwright = Playwright.create();
        PLAYWRIGHT.set(playwright);
        BROWSER.set(playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(!HEADED)));
    }

    @AfterAll
    static void closeBrowser() {
        BROWSER.get().close();
        PLAYWRIGHT.get().close();
        BROWSER.remove();
        PLAYWRIGHT.remove();
    }

    @BeforeEach
    void newContext(TestInfo testInfo) throws java.io.IOException {
        String testName = testInfo.getTestClass().map(Class::getSimpleName).orElse("Unknown")
                + "-" + testInfo.getTestMethod().map(m -> m.getName()).orElse(testInfo.getDisplayName());
        Path videoDir = VIDEO_TMP_DIR.resolve(testName);
        java.nio.file.Files.createDirectories(videoDir);

        context = BROWSER.get().newContext(new Browser.NewContextOptions()
                .setBaseURL(ApiClient.BASE_URL)
                .setRecordVideoDir(videoDir));
        context.tracing().start(new Tracing.StartOptions()
                .setScreenshots(true)
                .setSnapshots(true)
                .setSources(true));
        page = context.newPage();
        pages = new Pages(page);
    }

    // Context/page lifecycle (including closing, which flushes the recorded video) is owned by
    // FailureArtifactsExtension so it can capture failure artifacts before teardown.

    /** Injects the bootstrap admin's token into localStorage before the app's first load. */
    protected void signInAs(String token) {
        context.addInitScript("localStorage.setItem('tf_token', '" + token + "');");
    }
}
