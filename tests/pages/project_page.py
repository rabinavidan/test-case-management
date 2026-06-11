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
    def description(self) -> Locator:
        return self.view.locator("h1 + p")

    @property
    def new_suite_btn(self) -> Locator:
        return self.view.locator("button", has_text="New Suite").first

    # ── Stats ─────────────────────────────────────────────────────────────────

    def _stat_card(self, index: int) -> Locator:
        return self.view.locator(".grid > div").nth(index)

    def _stat_value(self, index: int) -> Locator:
        return self._stat_card(index).locator("p").first

    def _stat_label(self, index: int) -> Locator:
        return self._stat_card(index).locator("p").nth(1)

    @property
    def suites_stat_card(self) -> Locator:
        return self._stat_card(0)

    @property
    def suites_count(self) -> Locator:
        return self._stat_value(0)

    @property
    def test_cases_stat_card(self) -> Locator:
        return self._stat_card(1)

    @property
    def test_cases_count(self) -> Locator:
        return self._stat_value(1)

    @property
    def total_runs_stat_card(self) -> Locator:
        return self._stat_card(2)

    @property
    def total_runs_count(self) -> Locator:
        return self._stat_value(2)

    @property
    def pass_rate_stat_card(self) -> Locator:
        return self._stat_card(3)

    @property
    def pass_rate_value(self) -> Locator:
        return self._stat_value(3)

    # ── Suites section ────────────────────────────────────────────────────────

    @property
    def suites_section_heading(self) -> Locator:
        return self.view.locator("h2", has_text="Test Suites")

    @property
    def empty_state(self) -> Locator:
        return self.view.locator("p", has_text="No test suites yet.")

    @property
    def create_first_suite_link(self) -> Locator:
        return self.view.locator("button", has_text="Create your first suite")

    @property
    def suite_cards(self) -> Locator:
        return self.view.locator(".space-y-3 > div")

    def suite_card(self, name: str) -> Locator:
        return self.view.locator(".space-y-3 > div", has_text=name)

    def delete_suite_btn(self, name: str) -> Locator:
        return self.suite_card(name).locator("button[onclick*='deleteSuite']")

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
        self.suite_card(name).hover()
        self.page.once("dialog", lambda d: d.accept())
        self.delete_suite_btn(name).click()
        self.page.wait_for_load_state("networkidle")

    def click_suite(self, name: str):
        self.suite_card(name).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_loaded(self, project_name: str):
        expect(self.heading).to_have_text(project_name)

    def expect_empty_state(self):
        expect(self.empty_state).to_be_visible()

    def expect_suites_count(self, count: int):
        expect(self.suites_count).to_have_text(str(count))

    def expect_pass_rate(self, rate: str):
        """e.g. rate='0%' or '75%'"""
        expect(self.pass_rate_value).to_have_text(rate)

    def expect_suite_visible(self, name: str):
        expect(self.suite_card(name)).to_be_visible()

    def expect_suite_not_visible(self, name: str):
        expect(self.suite_card(name)).to_be_hidden()
