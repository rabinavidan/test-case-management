package com.testflow.e2e;

import com.testflow.e2e.pages.ProjectsPage;
import com.testflow.e2e.support.ApiClient;
import com.testflow.e2e.support.BaseTest;
import com.testflow.e2e.support.TestData;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Epic("TestFlow E2E")
@Feature("Projects")
class ProjectsTest extends BaseTest {

    private final List<Integer> createdProjectIds = new ArrayList<>();

    @BeforeEach
    void signIn() {
        signInAs(ApiClient.adminToken());
    }

    @AfterEach
    void cleanUp() {
        createdProjectIds.forEach(ApiClient::deleteProject);
        createdProjectIds.clear();
    }

    @Test
    void canCreateAProject() {
        String projectName = TestData.uniqueName("Project");
        ProjectsPage projectsPage = new ProjectsPage(page);

        projectsPage.goTo();
        projectsPage.clickNewProject();
        projectsPage.fillProjectForm(projectName, "Created by the Java E2E suite");
        projectsPage.submitProjectForm();

        assertThat(page.getByText(projectName).first()).isVisible();

        createdProjectIds.add(ApiClient.findProjectIdByName(projectName));
    }

    @Test
    void canDeleteAProject() {
        String projectName = TestData.uniqueName("Delete-Me");
        int projectId = ApiClient.createProject(projectName, "To be deleted");
        createdProjectIds.add(projectId);

        ProjectsPage projectsPage = new ProjectsPage(page);
        projectsPage.goTo();
        projectsPage.deleteProject(projectName);

        assertThat(page.getByText(projectName).first()).isHidden();
        createdProjectIds.remove(Integer.valueOf(projectId));
    }
}
