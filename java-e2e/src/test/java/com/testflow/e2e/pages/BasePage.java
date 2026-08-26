package com.testflow.e2e.pages;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.LoadState;

public abstract class BasePage {

    protected static final double TIMEOUT_SHORT = 5_000;
    protected static final double TIMEOUT_MEDIUM = 10_000;

    protected final Page page;

    protected BasePage(Page page) {
        this.page = page;
    }

    protected void navigate(String path) {
        page.navigate(path);
    }

    protected void waitForNetworkIdle() {
        page.waitForLoadState(LoadState.NETWORKIDLE);
    }
}
