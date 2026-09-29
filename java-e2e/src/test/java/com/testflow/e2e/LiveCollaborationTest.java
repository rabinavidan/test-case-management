package com.testflow.e2e;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.WebSocket;
import com.microsoft.playwright.WebSocketFrame;
import com.testflow.e2e.pages.RunPage;
import com.testflow.e2e.support.ApiClient;
import com.testflow.e2e.support.BaseTest;
import com.testflow.e2e.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Live run collaboration across two browsers — mirrors e2e/tests/realtime.spec.ts. A result
 * recorded in one browser (or through the GraphQL API) must appear in the other through the
 * run's WebSocket, without a reload.
 */
@Epic("TestFlow E2E")
@Feature("Live collaboration")
class LiveCollaborationTest extends BaseTest {

    private int projectId;
    private int alphaId;
    private int betaId;
    private int runId;
    private BrowserContext teammateContext;

    @BeforeEach
    void setUp() {
        signInAs(ApiClient.adminToken());
        projectId = ApiClient.createProject(TestData.uniqueName("Live-Project"), null);
        int suiteId = ApiClient.createSuite(projectId, TestData.uniqueName("Live-Suite"));
        alphaId = ApiClient.createTestCase(suiteId, "TC-Alpha", "active");
        betaId = ApiClient.createTestCase(suiteId, "TC-Beta", "active");
        runId = ApiClient.createRun(suiteId, TestData.uniqueName("Live-Run"));
    }

    @AfterEach
    void tearDown() {
        if (teammateContext != null) {
            teammateContext.close();
        }
        ApiClient.deleteProject(projectId);
    }

    private Page openRunAsTeammate() {
        Browser browser = context.browser();
        teammateContext = browser.newContext(new Browser.NewContextOptions().setBaseURL(ApiClient.BASE_URL));
        teammateContext.addInitScript("localStorage.setItem('tf_token', '" + ApiClient.adminToken() + "');");
        Page teammate = teammateContext.newPage();
        new RunPage(teammate).goTo(runId);
        return teammate;
    }

    private void openRunAndWaitUntilLive() {
        pages.run().goTo(runId);
        assertThat(page.locator("#ws-indicator")).isVisible();
    }

    private com.microsoft.playwright.Locator badge(int testCaseId) {
        return page.locator("[data-tc-id=\"" + testCaseId + "\"] [data-status-badge]");
    }

    @Test
    void aResultRecordedByATeammateAppearsWithoutAReload() {
        openRunAndWaitUntilLive();
        Page teammate = openRunAsTeammate();

        new RunPage(teammate).markResult("TC-Alpha", "fail", "Broken in staging");

        assertThat(badge(alphaId)).hasText("Fail");
        assertThat(badge(betaId)).hasText("Pending");
    }

    @Test
    void aGraphQLMutationIsPushedOverTheRunsWebSocket() {
        WebSocket socket = page.waitForWebSocket(
                new Page.WaitForWebSocketOptions().setPredicate(ws -> ws.url().contains("/ws/runs/" + runId)),
                this::openRunAndWaitUntilLive);
        assertThat(socket.url()).contains("token=");

        WebSocketFrame frame = socket.waitForFrameReceived(
                new WebSocket.WaitForFrameReceivedOptions().setPredicate(f -> f.text() != null && f.text().contains("result_updated")),
                () -> ApiClient.graphql(
                        "mutation($r: ID!, $t: ID!) { updateResult(runId: $r, testCaseId: $t, input: {status: SKIP}) { id } }",
                        Map.of("r", String.valueOf(runId), "t", String.valueOf(betaId))));

        assertThat(frame.text()).contains("\"testcase_id\": " + betaId).contains("\"status\": \"skip\"");
        assertThat(badge(betaId)).hasText("Skip");
    }
}
