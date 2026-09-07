package com.testflow.e2e.support;

import com.microsoft.playwright.Page;
import com.testflow.e2e.pages.LoginPage;
import com.testflow.e2e.pages.ProjectPage;
import com.testflow.e2e.pages.ProjectsPage;
import com.testflow.e2e.pages.RunPage;
import com.testflow.e2e.pages.SuitePage;

/**
 * Factory Method for page objects — one place that knows how to construct each {@code XxxPage},
 * so test classes ask {@link BaseTest#pages} for a page instead of calling {@code new XxxPage(page)}
 * themselves. Combined with each page object's methods returning {@code this} (see
 * {@link com.testflow.e2e.pages.BasePage} subclasses), a test reads as one fluent chain, e.g.
 * {@code pages.projects().goTo().clickNewProject().fillProjectForm(name, desc).submitProjectForm();}
 */
public final class Pages {

    private final Page page;

    public Pages(Page page) {
        this.page = page;
    }

    public LoginPage login() {
        return new LoginPage(page);
    }

    public ProjectsPage projects() {
        return new ProjectsPage(page);
    }

    public ProjectPage project() {
        return new ProjectPage(page);
    }

    public SuitePage suite() {
        return new SuitePage(page);
    }

    public RunPage run() {
        return new RunPage(page);
    }
}
