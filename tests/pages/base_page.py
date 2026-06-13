from playwright.sync_api import Page, Locator, expect


class BasePage:
    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url.rstrip("/")

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
        self.page.get_by_test_id("modal-close-btn").click()
        expect(self.modal_overlay).to_be_hidden()

    # ── Toast ────────────────────────────────────────────────────────────────
    @property
    def toast(self) -> Locator:
        return self.page.get_by_test_id("toast-inner")

    def expect_toast(self, text: str):
        expect(self.toast).to_contain_text(text)

    # ── Auth ─────────────────────────────────────────────────────────────────
    def login(self, username: str = "e2euser", password: str = "e2epass1"):
        """Log in via the auth modal. The user must already exist (created via API or bootstrap)."""
        self.page.goto(self.base_url)
        self.page.wait_for_load_state("networkidle")
        if self.page.get_by_test_id("logout-btn").is_visible():
            return
        self.page.get_by_test_id("signin-btn").click()
        self.page.get_by_test_id("auth-submit-btn").wait_for(state="visible")
        self.page.get_by_test_id("auth-username").fill(username)
        self.page.get_by_test_id("auth-password").fill(password)
        self.page.get_by_test_id("auth-submit-btn").click()
        self.page.get_by_test_id("logout-btn").wait_for(state="visible")

    # ── Helpers ──────────────────────────────────────────────────────────────
    def goto(self, hash: str = ""):
        self.page.goto(f"{self.base_url}/#{hash}" if hash else self.base_url)
        self.page.wait_for_load_state("networkidle")

    def click_logo(self):
        self.logo.click()
        self.page.wait_for_load_state("networkidle")
