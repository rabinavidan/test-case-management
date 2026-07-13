from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class LoginPage(BasePage):
    """POM for TestFlow's auth modal (there is no dedicated /login or /signup route —
    sign-in is a modal triggered by the 'Sign in' button on any page).

    HTML landmarks (see showAuthModal/renderAuthForm in static/app.js):
      [data-testid=signin-btn]     — opens the modal
      [data-testid=auth-username]  — username input
      [data-testid=auth-password]  — password input
      [data-testid=auth-submit-btn]— submit button
      #auth-error                  — validation/auth failure message
    """

    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    # ── Locators ──────────────────────────────────────────────────────────────

    @property
    def heading(self) -> Locator:
        return self.page.locator("#auth-form-container h1", has_text="TestFlow")

    @property
    def sign_in_heading(self) -> Locator:
        return self.page.locator("#auth-form-container h2", has_text="Sign in")

    @property
    def username_input(self) -> Locator:
        return self.page.get_by_test_id("auth-username")

    @property
    def password_input(self) -> Locator:
        return self.page.get_by_test_id("auth-password")

    @property
    def submit_btn(self) -> Locator:
        return self.page.get_by_test_id("auth-submit-btn")

    @property
    def auth_error(self) -> Locator:
        return self.page.locator("#auth-error")

    @property
    def contact_admin_text(self) -> Locator:
        return self.page.locator("text=Contact your admin to get an account.")

    # ── Actions ───────────────────────────────────────────────────────────────

    def open(self):
        """Load the app (as a guest) and open the sign-in modal."""
        self.log.step("Open sign-in modal")
        self.goto()
        self.page.get_by_test_id("signin-btn").click()
        self.log.assert_("auth modal visible")
        expect(self.submit_btn).to_be_visible()

    def login(self, username: str, password: str):
        """Open the sign-in modal and submit credentials (does not assume success)."""
        self.log.step(f"Attempt login as '{username}'")
        self.open()
        self.log.action("fill", "username field", username)
        self.username_input.fill(username)
        self.log.action("fill", "password field", "***")
        self.password_input.fill(password)
        self.log.action("click", "Sign in submit button")
        self.submit_btn.click()

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_modal_loaded(self):
        self.log.assert_("auth modal fully rendered")
        expect(self.heading).to_be_visible()
        expect(self.sign_in_heading).to_be_visible()
        expect(self.username_input).to_be_visible()
        expect(self.password_input).to_be_visible()
        expect(self.submit_btn).to_be_visible()

    def expect_contact_admin_text_visible(self):
        self.log.assert_("'contact your admin' message visible")
        expect(self.contact_admin_text).to_be_visible()

    def expect_login_error(self, text: str):
        self.log.assert_("auth error visible", text)
        expect(self.auth_error).to_be_visible()
        expect(self.auth_error).to_contain_text(text)

    def expect_logged_in(self):
        self.log.assert_("logged in — logout button visible")
        expect(self.page.get_by_test_id("logout-btn")).to_be_visible()
