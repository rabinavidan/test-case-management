from playwright.sync_api import Page, Locator, expect


class BasePage:
    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url.rstrip("/")

    # ── Navigation ──────────────────────────────────────────────────────────
    @property
    def logo(self) -> Locator:
        return self.page.locator("button", has_text="TestFlow").first

    @property
    def breadcrumb(self) -> Locator:
        return self.page.locator("#breadcrumb")

    @property
    def nav_new_btn(self) -> Locator:
        return self.page.locator("#nav-new-btn")

    @property
    def nav_new_label(self) -> Locator:
        return self.page.locator("#nav-new-label")

    # ── Sidebar ─────────────────────────────────────────────────────────────
    @property
    def sidebar(self) -> Locator:
        return self.page.locator("#sidebar-projects")

    def sidebar_project(self, name: str) -> Locator:
        return self.sidebar.locator(f"button", has_text=name)

    def sidebar_suite(self, name: str) -> Locator:
        return self.sidebar.locator(f"button", has_text=name)

    def sidebar_test_cases_link(self, suite_name: str) -> Locator:
        suite_btn = self.sidebar.locator("button", has_text=suite_name)
        return suite_btn.locator("..").locator("button", has_text="Test Cases")

    def sidebar_test_runs_link(self, suite_name: str) -> Locator:
        suite_btn = self.sidebar.locator("button", has_text=suite_name)
        return suite_btn.locator("..").locator("button", has_text="Test Runs")

    # ── Modal ────────────────────────────────────────────────────────────────
    @property
    def modal_overlay(self) -> Locator:
        return self.page.locator("#modal-overlay")

    @property
    def modal_box(self) -> Locator:
        return self.page.locator("#modal-box")

    @property
    def modal_title(self) -> Locator:
        return self.page.locator("#modal-title")

    @property
    def modal_body(self) -> Locator:
        return self.page.locator("#modal-body")

    def modal_input(self, placeholder: str) -> Locator:
        return self.modal_body.locator(f"input[placeholder*='{placeholder}']")

    def modal_textarea(self, placeholder: str) -> Locator:
        return self.modal_body.locator(f"textarea[placeholder*='{placeholder}']")

    def modal_submit(self, label: str) -> Locator:
        return self.modal_body.locator(f"button", has_text=label)

    def close_modal(self):
        self.page.locator("#modal-box").locator("button").first.click()
        expect(self.modal_overlay).to_be_hidden()

    # ── Toast ────────────────────────────────────────────────────────────────
    @property
    def toast(self) -> Locator:
        return self.page.locator("#toast-inner")

    def expect_toast(self, text: str):
        expect(self.toast).to_contain_text(text)

    # ── Helpers ──────────────────────────────────────────────────────────────
    def goto(self, hash: str = ""):
        self.page.goto(f"{self.base_url}/#{hash}" if hash else self.base_url)
        self.page.wait_for_load_state("networkidle")

    def click_logo(self):
        self.logo.click()
        self.page.wait_for_load_state("networkidle")
