package com.testflow.e2e.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/** Mirrors {@code e2e/pages/project.page.ts} (project detail — suite creation). */
public class ProjectPage extends BasePage {

    private final Locator newSuiteBtn;
    private final Locator nameInput;
    private final Locator descInput;
    private final Locator submitBtn;

    public ProjectPage(Page page) {
        super(page);
        this.newSuiteBtn = page.getByTestId("nav-new-btn");
        this.nameInput = page.locator("[data-testid=\"f-name\"], #f-name");
        this.descInput = page.locator("[data-testid=\"f-desc\"], #f-desc");
        this.submitBtn = page.getByTestId("modal-submit-btn");
    }

    public void goTo(int projectId) {
        navigate("/#project/" + projectId);
        waitForNetworkIdle();
    }

    public void clickNewSuite() {
        newSuiteBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        newSuiteBtn.click();
    }

    public void fillSuiteForm(String name, String description) {
        nameInput.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        nameInput.fill(name);
        if (description != null) {
            descInput.fill(description);
        }
    }

    public void submitSuiteForm() {
        submitBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_SHORT));
        submitBtn.click();
        waitForNetworkIdle();
    }
}
