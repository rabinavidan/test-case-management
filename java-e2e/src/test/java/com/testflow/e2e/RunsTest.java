package com.testflow.e2e;

import com.testflow.e2e.pages.RunPage;
import com.testflow.e2e.pages.SuitePage;
import com.testflow.e2e.support.ApiClient;
import com.testflow.e2e.support.BaseTest;
import com.testflow.e2e.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@Epic("TestFlow E2E")
@Feature("Test Runs")
class RunsTest extends BaseTest {

    private int projectId;
    private int suiteId;

    @BeforeEach
    void setUp() {
        signInAs(ApiClient.adminToken());
        projectId = ApiClient.createProject(TestData.uniqueName("Run-Project"), null);
        suiteId = ApiClient.createSuite(projectId, TestData.uniqueName("Run-Suite"));
        ApiClient.createTestCase(suiteId, "TC-Alpha", "active");
        ApiClient.createTestCase(suiteId, "TC-Beta", "active");
    }

    @AfterEach
    void tearDown() {
        ApiClient.deleteProject(projectId);
    }

    @Test
    void canStartATestRunFromASuite() {
        SuitePage suitePage = new SuitePage(page);
        suitePage.goTo(suiteId);
        int runId = suitePage.startRun(TestData.uniqueName("Run"));

        assertThat(runId).isGreaterThan(0);
        assertThat(page.url()).contains("run/" + runId);
    }

    @Test
    void canMarkTestCasesPassAndFailAndSeeTheSummaryUpdate() {
        SuitePage suitePage = new SuitePage(page);
        suitePage.goTo(suiteId);
        int runId = suitePage.startRun(TestData.uniqueName("Run"));

        RunPage runPage = new RunPage(page);
        runPage.goTo(runId);
        runPage.markResult("TC-Alpha", "pass", "All good");
        runPage.markResult("TC-Beta", "fail", "Broke on submit");

        RunPage.RunSummary summary = runPage.getSummary();
        assertThat(summary.pass()).isGreaterThanOrEqualTo(1);
        assertThat(summary.fail()).isGreaterThanOrEqualTo(1);
        assertThat(summary.pending()).isEqualTo(0);
    }
}
