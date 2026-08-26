package com.testflow.e2e;

import com.testflow.e2e.pages.ProjectPage;
import com.testflow.e2e.support.ApiClient;
import com.testflow.e2e.support.BaseTest;
import com.testflow.e2e.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Epic("TestFlow E2E")
@Feature("Test Suites")
class SuitesTest extends BaseTest {

    private int projectId;

    @BeforeEach
    void setUp() {
        signInAs(ApiClient.adminToken());
        projectId = ApiClient.createProject(TestData.uniqueName("Suite-Test-Project"), "For suite E2E tests");
    }

    @AfterEach
    void tearDown() {
        ApiClient.deleteProject(projectId);
    }

    @Test
    void canCreateATestSuiteInsideAProject() {
        String suiteName = TestData.uniqueName("My-Suite");
        ProjectPage projectPage = new ProjectPage(page);

        projectPage.goTo(projectId);
        projectPage.clickNewSuite();
        projectPage.fillSuiteForm(suiteName, "A test suite for e2e");
        projectPage.submitSuiteForm();

        assertThat(page.getByText(suiteName).first()).isVisible();
    }
}
