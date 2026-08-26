package com.testflow.e2e.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

import java.util.regex.Pattern;

/** Mirrors {@code e2e/pages/suite.page.ts}. */
public class SuitePage extends BasePage {

    private final Locator newTestCaseBtn;
    private final Locator titleInput;
    private final Locator descInput;
    private final Locator submitBtn;
    private final Locator startRunBtn;
    private final Locator runNameInput;
    private final Locator modalBody;

    public SuitePage(Page page) {
        super(page);
        this.newTestCaseBtn = page.getByTestId("nav-new-btn");
        this.titleInput = page.locator("[data-testid=\"f-title\"], #f-title");
        this.descInput = page.locator("[data-testid=\"f-desc\"], #f-desc");
        this.submitBtn = page.getByTestId("modal-submit-btn");
        this.startRunBtn = page.locator("button", new Page.LocatorOptions().setHasText("Start Run"));
        this.runNameInput = page.locator("#f-name");
        this.modalBody = page.getByTestId("modal-body");
    }

    public void goTo(int suiteId) {
        navigate("/#suite/" + suiteId);
        waitForNetworkIdle();
    }

    public void clickNewTestCase() {
        newTestCaseBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        newTestCaseBtn.click();
    }

    public void fillTestCaseForm(String title, String description) {
        titleInput.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        titleInput.fill(title);
        if (description != null) {
            descInput.fill(description);
        }
    }

    public void submitTestCaseForm() {
        submitBtn.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_SHORT));
        submitBtn.click();
        waitForNetworkIdle();
    }

    /** Starts a run with the given name and returns its id, parsed from the resulting URL. */
    public int startRun(String name) {
        startRunBtn.first().waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        startRunBtn.first().click();
        runNameInput.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        runNameInput.fill(name);

        Locator submit = modalBody.locator("button", new Locator.LocatorOptions().setHasText("Start Run"));
        submit.waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_SHORT));
        submit.click();
        waitForNetworkIdle();

        page.waitForURL(Pattern.compile(".*run/\\d+.*"));
        var matcher = Pattern.compile("run/(\\d+)").matcher(page.url());
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
    }
}
