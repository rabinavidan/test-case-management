package com.testflow.e2e.support;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.Tracing;
import com.microsoft.playwright.Video;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * Runs after each {@code @Test} method but before {@code @AfterEach}/teardown, while the
 * page/context from {@link BaseTest} are still open — the only point where a failure screenshot
 * can be taken and the trace can be stopped-and-saved before the browser context closes.
 *
 * <p>On failure: saves a full-page screenshot, the Playwright trace, and the recorded video
 * (Playwright only finalizes video files once the context closes, so closing happens here too).
 * On success: discards the trace and deletes the video, keeping CI artifacts small — the same
 * "only on failure" policy {@code e2e/playwright.config.ts} uses for the TypeScript suite.
 */
public class FailureArtifactsExtension implements AfterTestExecutionCallback {

    @Override
    public void afterTestExecution(ExtensionContext extensionContext) throws IOException {
        Object testInstance = extensionContext.getRequiredTestInstance();
        if (!(testInstance instanceof BaseTest base) || base.context == null) {
            return;
        }

        boolean failed = extensionContext.getExecutionException().isPresent();
        String name = extensionContext.getRequiredTestClass().getSimpleName()
                + "-" + extensionContext.getRequiredTestMethod().getName();

        if (failed) {
            Files.createDirectories(BaseTest.ARTIFACTS_DIR);
            try {
                base.page.screenshot(new Page.ScreenshotOptions()
                        .setPath(BaseTest.ARTIFACTS_DIR.resolve(name + ".png"))
                        .setFullPage(true));
            } catch (RuntimeException e) {
                // Best-effort: a screenshot failure (e.g. page already navigating away) must
                // not mask the real test failure.
            }
            base.context.tracing().stop(new Tracing.StopOptions()
                    .setPath(BaseTest.ARTIFACTS_DIR.resolve(name + "-trace.zip")));
        } else {
            base.context.tracing().stop();
        }

        Video video = base.page.video();
        base.context.close();

        if (failed && video != null) {
            Path recorded = video.path();
            if (Files.exists(recorded)) {
                Files.move(recorded, BaseTest.ARTIFACTS_DIR.resolve(name + ".webm"),
                        StandardCopyOption.REPLACE_EXISTING);
            }
        }

        deleteRecursively(BaseTest.VIDEO_TMP_DIR.resolve(name));
    }

    private static void deleteRecursively(Path dir) {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (IOException | UncheckedIOException e) {
            // Best-effort cleanup of a scratch dir — leaving stray temp files behind is
            // harmless and must not fail the test run.
        }
    }
}
