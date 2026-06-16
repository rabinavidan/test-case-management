import os
from playwright.sync_api import Page, Locator, expect
from tests.logger import PWLogger

_DEFAULT_EMAIL    = os.environ.get("LOGIN_EMAIL", "e2eadmin@test.com")
_DEFAULT_PASSWORD = os.environ.get("LOGIN_PASSWORD", "e2epass1")

LOGIN_PATH = "/login"


class LoginPage:
    """POM for the TestManager /login page.

    HTML landmarks:
      #email    — email input
      #password — password input
      button[type=submit] — "Sign in" button
      a[href="/signup"]   — "create a new account" link
    """

    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url.rstrip("/")
        self.log = PWLogger("LoginPage")

    # ── Locators ──────────────────────────────────────────────────────────────

    @property
    def heading(self) -> Locator:
        return self.page.locator("h1", has_text="TestManager")

    @property
    def sign_in_heading(self) -> Locator:
        return self.page.locator("h2", has_text="Sign in to your account")

    @property
    def email_input(self) -> Locator:
        return self.page.locator("#email")

    @property
    def password_input(self) -> Locator:
        return self.page.locator("#password")

    @property
    def submit_btn(self) -> Locator:
        return self.page.locator("button[type='submit']", has_text="Sign in")

    @property
    def create_account_link(self) -> Locator:
        return self.page.locator("a[href='/signup']")

    # ── Actions ───────────────────────────────────────────────────────────────

    def navigate(self):
        url = f"{self.base_url}{LOGIN_PATH}"
        self.log.navigate(url)
        self.page.goto(url)
        self.page.wait_for_load_state("networkidle")

    def fill_email(self, email: str):
        self.log.action("fill", "email input", email)
        self.email_input.fill(email)

    def fill_password(self, password: str):
        self.log.action("fill", "password input", "***")
        self.password_input.fill(password)

    def click_sign_in(self):
        self.log.action("click", "Sign in button")
        self.submit_btn.click()

    def login(self, email: str = _DEFAULT_EMAIL, password: str = _DEFAULT_PASSWORD):
        """Full login flow: navigate → fill credentials → submit."""
        self.log.step(f"Login as '{email}'")
        self.navigate()
        self.fill_email(email)
        self.fill_password(password)
        self.click_sign_in()

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_page_loaded(self):
        self.log.assert_("login page loaded")
        expect(self.heading).to_be_visible()
        expect(self.sign_in_heading).to_be_visible()
        expect(self.email_input).to_be_visible()
        expect(self.password_input).to_be_visible()
        expect(self.submit_btn).to_be_visible()

    def expect_create_account_link_visible(self):
        self.log.assert_("create account link visible")
        expect(self.create_account_link).to_be_visible()
