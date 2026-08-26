package com.testflow.e2e;

import com.testflow.e2e.pages.SuitePage;
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
@Feature("Test Cases")
class TestCasesTest extends BaseTest {

    private int projectId;
    private int suiteId;

    @BeforeEach
    void setUp() {
        signInAs(ApiClient.adminToken());
        projectId = ApiClient.createProject(TestData.uniqueName("TC-Project"), "For test case E2E tests");
        suiteId = ApiClient.createSuite(projectId, TestData.uniqueName("TC-Suite"));
    }

    @AfterEach
    void tearDown() {
        ApiClient.deleteProject(projectId);
    }

    @Test
    void canCreateATestCase() {
        String title = TestData.uniqueName("Full-Test-Case");
        SuitePage suitePage = new SuitePage(page);

        suitePage.goTo(suiteId);
        suitePage.clickNewTestCase();
        suitePage.fillTestCaseForm(title, "Created by the Java E2E suite");
        suitePage.submitTestCaseForm();

        assertThat(page.getByText(title).first()).isVisible();
    }
}
