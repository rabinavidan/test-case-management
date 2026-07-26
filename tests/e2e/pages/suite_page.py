from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class SuitePage(BasePage):
    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    def goto(self, suite_id: int):
        super().goto(f"suite/{suite_id}")

    def goto_test_cases(self, suite_id: int):
        super().goto(f"suite/{suite_id}/testcases")

    def goto_test_runs(self, suite_id: int):
        super().goto(f"suite/{suite_id}/runs")

    # ── Page elements ────────────────────────────────────────────────────────
    @property
    def view(self) -> Locator:
        return self.page.locator("#view-suite")

    @property
    def heading(self) -> Locator:
        return self.view.locator("h1")

    @property
    def new_test_case_btn(self) -> Locator:
        return self.view.locator("button", has_text="New Test Case").first

    @property
    def start_run_btn(self) -> Locator:
        return self.view.locator("button", has_text="Start Run").first

    @property
    def test_case_cards(self) -> Locator:
        return self.view.locator("[data-testid^='testcase-card-']")

    def test_case_card(self, title: str) -> Locator:
        return self.view.locator("[data-testid^='testcase-card-']", has_text=title)

    def delete_test_case_btn(self, title: str) -> Locator:
        return self.test_case_card(title).locator("[data-testid^='delete-testcase-']")

    def edit_test_case_btn(self, title: str) -> Locator:
        return self.test_case_card(title).locator("[data-testid^='edit-testcase-']")

    @property
    def run_cards(self) -> Locator:
        return self.view.locator("[data-testid^='run-card-']")

    def run_card(self, name: str) -> Locator:
        return self.view.locator("[data-testid^='run-card-']", has_text=name)

    # ── Status counts ─────────────────────────────────────────────────────────
    @property
    def status_badges(self) -> Locator:
        return self.view.locator(".flex.flex-wrap.gap-2 span")

    # ── Actions ───────────────────────────────────────────────────────────────
    def open_new_test_case_modal(self):
        self.new_test_case_btn.click()
        expect(self.modal_title).to_have_text("New Test Case")

    def create_test_case(self, title: str, status: str = "active", priority: str = "medium",
                         description: str = "", steps: str = "", expected: str = ""):
        self.open_new_test_case_modal()
        self.modal_input("Verify user can log in").fill(title)
        if description:
            self.modal_textarea("Brief description").fill(description)
        if steps:
            self.modal_textarea("1. Navigate").fill(steps)
        if expected:
            self.modal_textarea("User is redirected").fill(expected)
        if status != "active":
            self.modal_body.locator("#f-status").select_option(status)
        if priority != "medium":
            self.modal_body.locator("#f-priority").select_option(priority)
        self.modal_submit("Create Test Case").click()
        self.page.wait_for_load_state("networkidle")

    def delete_test_case(self, title: str):
        card = self.test_case_card(title)
        card.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.delete_test_case_btn(title).click()
        self.page.wait_for_load_state("networkidle")

    def open_start_run_modal(self):
        self.start_run_btn.click()
        expect(self.modal_title).to_have_text("Start Test Run")

    def start_run(self, name: str = ""):
        self.open_start_run_modal()
        if name:
            self.page.locator("#f-name").fill(name)
        self.modal_submit("Start Run").click()
        self.page.wait_for_load_state("networkidle")

    def click_run(self, name: str):
        self.run_card(name).click()
        self.page.wait_for_load_state("networkidle")

    # ── Run view: record result ───────────────────────────────────────────────
    def record_result(self, tc_title: str, status: str, notes: str = ""):
        self.view.locator(f"button", has_text="Record").first.click()
        expect(self.modal_title).to_have_text("Record Result")
        self.page.locator(f"#rs-{status}").click()
        if notes:
            self.page.locator("#f-notes").fill(notes)
        self.modal_submit("Save Result").click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────
    def expect_loaded(self, heading_text: str):
        expect(self.heading).to_have_text(heading_text)

    def expect_test_case_visible(self, title: str):
        expect(self.test_case_card(title)).to_be_visible()

    def expect_test_case_not_visible(self, title: str):
        expect(self.test_case_card(title)).to_be_hidden()

    def expect_run_visible(self, name: str):
        expect(self.view.locator(f"text={name}").first).to_be_visible()
