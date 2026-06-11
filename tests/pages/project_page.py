from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class ProjectPage(BasePage):
    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    def goto(self, project_id: int):
        super().goto(f"project/{project_id}")

    # ── Page elements ────────────────────────────────────────────────────────
    @property
    def view(self) -> Locator:
        return self.page.locator("#view-project")

    @property
    def heading(self) -> Locator:
        return self.view.locator("h1")

    @property
    def new_suite_btn(self) -> Locator:
        return self.view.locator("button", has_text="New Suite").first

    @property
    def suite_cards(self) -> Locator:
        return self.view.locator(".space-y-3 > div")

    def suite_card(self, name: str) -> Locator:
        return self.view.locator(".space-y-3 > div", has_text=name)

    def delete_suite_btn(self, name: str) -> Locator:
        return self.suite_card(name).locator("button[onclick*='deleteSuite']")

    # ── Stats ─────────────────────────────────────────────────────────────────
    @property
    def total_suites_stat(self) -> Locator:
        return self.view.locator(".grid > div").nth(0)

    @property
    def total_cases_stat(self) -> Locator:
        return self.view.locator(".grid > div").nth(1)

    @property
    def total_runs_stat(self) -> Locator:
        return self.view.locator(".grid > div").nth(2)

    @property
    def pass_rate_stat(self) -> Locator:
        return self.view.locator(".grid > div").nth(3)

    # ── Actions ───────────────────────────────────────────────────────────────
    def open_new_suite_modal(self):
        self.new_suite_btn.click()
        expect(self.modal_title).to_have_text("New Test Suite")

    def create_suite(self, name: str, description: str = ""):
        self.open_new_suite_modal()
        self.modal_input("Login Tests").fill(name)
        if description:
            self.modal_textarea("Optional description").fill(description)
        self.modal_submit("Create Suite").click()
        self.page.wait_for_load_state("networkidle")

    def delete_suite(self, name: str):
        card = self.suite_card(name)
        card.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.delete_suite_btn(name).click()
        self.page.wait_for_load_state("networkidle")

    def click_suite(self, name: str):
        self.suite_card(name).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────
    def expect_loaded(self, project_name: str):
        expect(self.heading).to_have_text(project_name)

    def expect_suite_visible(self, name: str):
        expect(self.suite_card(name)).to_be_visible()

    def expect_suite_not_visible(self, name: str):
        expect(self.suite_card(name)).to_be_hidden()
