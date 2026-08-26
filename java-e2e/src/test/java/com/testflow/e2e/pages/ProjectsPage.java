package com.testflow.e2e.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/** Mirrors {@code e2e/pages/projects.page.ts}. */
public class ProjectsPage extends BasePage {

    private final Locator newProjectBtn;
    private final Locator nameInput;
    private final Locator descInput;
    private final Locator submitBtn;

    public ProjectsPage(Page page) {
        super(page);
        this.newProjectBtn = page.getByTestId("nav-new-btn");
        this.nameInput = page.locator("[data-testid=\"f-name\"], #f-name");
        this.descInput = page.locator("[data-testid=\"f-desc\"], #f-desc");
        this.submitBtn = page.getByTestId("modal-submit-btn");
    }

    public void goTo() {
        navigate("/");
        waitForNetworkIdle();
    }

    public void clickNewProject() {
        newProjectBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        newProjectBtn.click();
    }

    public void fillProjectForm(String name, String description) {
        nameInput.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        nameInput.fill(name);
        if (description != null) {
            descInput.fill(description);
        }
    }

    public void submitProjectForm() {
        submitBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_SHORT));
        submitBtn.click();
        waitForNetworkIdle();
    }

    public void deleteProject(String name) {
        Locator row = page.locator("[data-testid^=\"project-row-\"]").filter(new Locator.FilterOptions().setHasText(name));
        page.onDialog(dialog -> dialog.accept());
        row.locator("[data-testid^=\"delete-project-\"]").click(new Locator.ClickOptions().setForce(true));
        waitForNetworkIdle();
    }
}
