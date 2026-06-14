import os
from playwright.sync_api import Page, Locator, expect
from tests.logger import PWLogger

_DEFAULT_USERNAME = "e2eadmin"
_DEFAULT_EMAIL    = "e2eadmin@test.com"
_DEFAULT_PASSWORD = "e2epass1"


class BasePage:
    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url.rstrip("/")
        self.log = PWLogger(self.__class__.__name__)

    # ── Navigation ──────────────────────────────────────────────────────────
    @property
    def logo(self) -> Locator:
        return self.page.get_by_test_id("logo-btn")

    @property
    def breadcrumb(self) -> Locator:
        return self.page.get_by_test_id("breadcrumb")

    @property
    def nav_new_btn(self) -> Locator:
        return self.page.get_by_test_id("nav-new-btn")

    @property
    def nav_new_label(self) -> Locator:
        return self.page.get_by_test_id("nav-new-label")

    # ── Sidebar ─────────────────────────────────────────────────────────────
    @property
    def sidebar(self) -> Locator:
        return self.page.get_by_test_id("sidebar-projects")

    def sidebar_project(self, name: str) -> Locator:
        return self.sidebar.locator("button", has_text=name)

    def sidebar_suite(self, name: str) -> Locator:
        return self.sidebar.locator("button", has_text=name)

    def sidebar_test_cases_link(self, suite_name: str) -> Locator:
        suite_btn = self.sidebar.locator("button", has_text=suite_name)
        return suite_btn.locator("..").locator("button", has_text="Test Cases")

    def sidebar_test_runs_link(self, suite_name: str) -> Locator:
        suite_btn = self.sidebar.locator("button", has_text=suite_name)
        return suite_btn.locator("..").locator("button", has_text="Test Runs")

    # ── Modal ────────────────────────────────────────────────────────────────
    @property
    def modal_overlay(self) -> Locator:
        return self.page.get_by_test_id("modal-overlay")

    @property
    def modal_box(self) -> Locator:
        return self.page.get_by_test_id("modal-box")

    @property
    def modal_title(self) -> Locator:
        return self.page.get_by_test_id("modal-title")

    @property
    def modal_body(self) -> Locator:
        return self.page.get_by_test_id("modal-body")

    def modal_input(self, placeholder: str) -> Locator:
        return self.modal_body.locator(f"input[placeholder*='{placeholder}']")

    def modal_textarea(self, placeholder: str) -> Locator:
        return self.modal_body.locator(f"textarea[placeholder*='{placeholder}']")

    def modal_submit(self, label: str) -> Locator:
        return self.page.get_by_test_id("modal-submit-btn").filter(has_text=label)

    def close_modal(self):
        self.log.action("click", "modal close button")
        self.page.get_by_test_id("modal-close-btn").click()
        self.log.assert_("modal hidden")
        expect(self.modal_overlay).to_be_hidden()

    # ── Toast ────────────────────────────────────────────────────────────────
    @property
    def toast(self) -> Locator:
        return self.page.get_by_test_id("toast-inner")

    def expect_toast(self, text: str):
        self.log.assert_("toast visible", text)
        expect(self.toast).to_contain_text(text)

    # ── Auth ─────────────────────────────────────────────────────────────────
    def login(self, username: str | None = None, password: str | None = None):
        """Log in via the auth modal. Reads credentials from E2E_USERNAME / E2E_PASSWORD env vars.

        Handles three cases automatically:
        - Already logged in: no-op
        - Setup screen (first run, no users): fills registration form in the browser
        - Normal sign-in: clicks Sign In button then fills login form
        """
        username = username or os.environ.get("E2E_USERNAME", _DEFAULT_USERNAME)
        email    = os.environ.get("E2E_EMAIL", _DEFAULT_EMAIL)
        password = password or os.environ.get("E2E_PASSWORD", _DEFAULT_PASSWORD)
        self.log.step(f"Login as '{username}'")
        self.log.navigate(self.base_url)
        self.page.goto(self.base_url)
        self.page.wait_for_load_state("networkidle")

        if self.page.get_by_test_id("logout-btn").is_visible():
            self.log.info(f"Already logged in, skipping login")
            return

        # Setup mode: app shows registration form automatically (no users in DB).
        # Detected by auth-email field being visible (only present in setup mode).
        if self.page.get_by_test_id("auth-email").is_visible():
            self.log.info("Setup screen detected — registering admin via browser form")
            self.page.get_by_test_id("auth-username").fill(username)
            self.page.get_by_test_id("auth-email").fill(email)
            self.page.get_by_test_id("auth-password").fill(password)
            self.log.action("click", "Create Admin Account button")
            self.page.get_by_test_id("auth-submit-btn").click()
            self.page.get_by_test_id("logout-btn").wait_for(state="visible")
            self.log.assert_("admin registered and logged in", username)
            return

        self.log.action("click", "Sign in button")
        self.page.get_by_test_id("signin-btn").click()
        self.page.get_by_test_id("auth-submit-btn").wait_for(state="visible")
        self.log.action("fill", "username field", username)
        self.page.get_by_test_id("auth-username").fill(username)
        self.log.action("fill", "password field", "***")
        self.page.get_by_test_id("auth-password").fill(password)
        self.log.action("click", "auth submit button")
        self.page.get_by_test_id("auth-submit-btn").click()
        self.page.get_by_test_id("logout-btn").wait_for(state="visible")
        self.log.assert_("logged in successfully", username)

    # ── Helpers ──────────────────────────────────────────────────────────────
    def goto(self, hash: str = ""):
        url = f"{self.base_url}/#{hash}" if hash else self.base_url
        self.log.navigate(url)
        self.page.goto(url)
        self.page.wait_for_load_state("networkidle")

    def click_logo(self):
        self.log.action("click", "logo / home button")
        self.logo.click()
        self.page.wait_for_load_state("networkidle")
