package com.testflow.e2e;

import com.testflow.e2e.pages.LoginPage;
import com.testflow.e2e.support.BaseTest;
import io.qameta.allure.Epic;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

// Same credentials e2e/global-setup.ts registers before the TypeScript suite runs.
@Epic("TestFlow E2E")
@Feature("Sign-in modal")
class LoginTest extends BaseTest {

    private static final String USERNAME = "testuser_e2e";
    private static final String PASSWORD = "Test@12345";

    @Test
    void rendersAllExpectedElementsWhenOpened() {
        LoginPage loginPage = new LoginPage(page);
        loginPage.open();
        loginPage.expectModalLoaded();
        assertThat(loginPage.contactAdminTextVisible()).isTrue();
    }

    @Test
    void validCredentialsSignTheUserIn() {
        LoginPage loginPage = new LoginPage(page);
        loginPage.login(USERNAME, PASSWORD);
        loginPage.expectLoggedIn();
    }

    @Test
    void invalidCredentialsShowAnErrorAndLeaveTheUserLoggedOut() {
        LoginPage loginPage = new LoginPage(page);
        loginPage.login(USERNAME, "not-the-real-password");

        assertThat(loginPage.loginErrorText()).contains("Invalid username or password");
        assertThat(page.getByTestId("signin-btn").isVisible()).isTrue();
    }
}
