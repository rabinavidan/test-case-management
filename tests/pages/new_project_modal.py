from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class NewProjectModal(BasePage):
    """Page object for the New Project modal dialog."""

    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    # ── Elements ──────────────────────────────────────────────────────────────

    @property
    def title(self) -> Locator:
        return self.page.locator("#modal-title")

    @property
    def name_input(self) -> Locator:
        return self.page.locator("#f-name")

    @property
    def description_input(self) -> Locator:
        return self.page.locator("#f-desc")

    @property
    def create_btn(self) -> Locator:
        return self.page.locator("#modal-body button", has_text="Create Project")

    @property
    def cancel_btn(self) -> Locator:
        return self.page.locator("#modal-body button", has_text="Cancel")

    @property
    def close_btn(self) -> Locator:
        return self.page.locator("#modal-box button").first

    # ── Actions ───────────────────────────────────────────────────────────────

    def fill(self, name: str, description: str = ""):
        self.name_input.fill(name)
        if description:
            self.description_input.fill(description)

    def submit(self, name: str, description: str = ""):
        self.fill(name, description)
        self.create_btn.click()
        self.page.wait_for_load_state("networkidle")

    def cancel(self):
        self.cancel_btn.click()
        expect(self.modal_overlay).to_be_hidden()

    def dismiss(self):
        self.close_btn.click()
        expect(self.modal_overlay).to_be_hidden()

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_open(self):
        expect(self.title).to_have_text("New Project")
        expect(self.modal_overlay).to_be_visible()
        expect(self.name_input).to_be_visible()

    def expect_name_placeholder(self):
        expect(self.name_input).to_have_attribute("placeholder", "My Project")

    def expect_description_placeholder(self):
        expect(self.description_input).to_have_attribute("placeholder", "Optional description")
