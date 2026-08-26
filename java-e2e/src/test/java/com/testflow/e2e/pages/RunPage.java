package com.testflow.e2e.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.WaitForSelectorState;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Mirrors {@code e2e/pages/run.page.ts}. */
public class RunPage extends BasePage {

    private final Locator resultRows;
    private final Locator summaryGrid;
    private final Locator modalOverlay;

    public RunPage(Page page) {
        super(page);
        this.resultRows = page.locator("#results-list > div");
        this.summaryGrid = page.locator("#view-run .grid-cols-4 > div");
        this.modalOverlay = page.locator("#modal-overlay");
    }

    public void goTo(int runId) {
        navigate("/#run/" + runId);
        waitForNetworkIdle();
    }

    public void markResult(String testCaseTitle, String status, String notes) {
        Locator row = resultRows.filter(new Locator.FilterOptions().setHasText(testCaseTitle));
        Locator recordBtn = row.locator("button", new Locator.LocatorOptions().setHasText("Record"))
                .or(row.locator("button", new Locator.LocatorOptions().setHasText("Update")));
        recordBtn.first().waitFor(new Locator.WaitForOptions().setTimeout(TIMEOUT_MEDIUM));
        recordBtn.first().click();

        page.locator("#rs-" + status).click();

        if (notes != null) {
            Locator notesField = page.locator("#f-notes");
            if (notesField.isVisible()) {
                notesField.fill(notes);
            }
        }

        page.locator("button", new Page.LocatorOptions().setHasText("Save Result")).click();
        try {
            modalOverlay.waitFor(new Locator.WaitForOptions()
                    .setState(WaitForSelectorState.HIDDEN).setTimeout(TIMEOUT_MEDIUM));
        } catch (Exception e) {
            page.keyboard().press("Escape");
            modalOverlay.waitFor(new Locator.WaitForOptions()
                    .setState(WaitForSelectorState.HIDDEN).setTimeout(TIMEOUT_SHORT));
        }
        waitForNetworkIdle();
    }

    public RunSummary getSummary() {
        return new RunSummary(
                count("Pass"),
                count("Fail"),
                count("Skip"),
                count("Pending"));
    }

    private int count(String label) {
        Locator cell = summaryGrid.filter(new Locator.FilterOptions().setHasText(label));
        String text = cell.textContent();
        Matcher m = Pattern.compile("\\d+").matcher(text == null ? "" : text);
        return m.find() ? Integer.parseInt(m.group()) : 0;
    }

    public record RunSummary(int pass, int fail, int skip, int pending) {
    }
}
