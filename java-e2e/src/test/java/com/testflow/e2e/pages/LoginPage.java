package com.testflow.e2e.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

/**
 * POM for TestFlow's auth modal (there is no dedicated /login route — sign-in is a modal
 * triggered by the "Sign in" button on any page). Mirrors {@code e2e/pages/login.page.ts}.
 */
public class LoginPage extends BasePage {

    private final Locator heading;
    private final Locator signInHeading;
    private final Locator usernameInput;
    private final Locator passwordInput;
    private final Locator submitBtn;
    private final Locator authError;
    private final Locator contactAdminText;

    public LoginPage(Page page) {
        super(page);
        this.heading = page.locator("#auth-form-container h1", new Page.LocatorOptions().setHasText("TestFlow"));
        this.signInHeading = page.locator("#auth-form-container h2", new Page.LocatorOptions().setHasText("Sign in"));
        this.usernameInput = page.getByTestId("auth-username");
        this.passwordInput = page.getByTestId("auth-password");
        this.submitBtn = page.getByTestId("auth-submit-btn");
        this.authError = page.locator("#auth-error");
        this.contactAdminText = page.getByText("Contact your admin to get an account.");
    }

    /** Loads the app as a guest and opens the sign-in modal. */
    public void open() {
        navigate("/");
        waitForNetworkIdle();
        page.getByTestId("signin-btn").click();
        submitBtn.waitFor();
    }

    /** Opens the sign-in modal and submits credentials (does not assume success). */
    public void login(String username, String password) {
        open();
        usernameInput.fill(username);
        passwordInput.fill(password);
        submitBtn.click();
    }

    public void expectModalLoaded() {
        heading.waitFor();
        signInHeading.waitFor();
        usernameInput.waitFor();
        passwordInput.waitFor();
        submitBtn.waitFor();
    }

    public boolean contactAdminTextVisible() {
        return contactAdminText.isVisible();
    }

    public String loginErrorText() {
        authError.waitFor();
        return authError.textContent();
    }

    public void expectLoggedIn() {
        assertThat(page.getByTestId("logout-btn")).isVisible();
    }
}
