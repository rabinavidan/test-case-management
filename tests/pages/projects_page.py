from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class ProjectsPage(BasePage):
    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    def goto(self):
        super().goto("projects")

    # ── Page elements ────────────────────────────────────────────────────────
    @property
    def heading(self) -> Locator:
        return self.page.locator("#view-projects h1", has_text="Projects")

    @property
    def project_count_text(self) -> Locator:
        return self.page.locator("#view-projects p").first

    @property
    def new_project_btn(self) -> Locator:
        return self.page.locator("#view-projects button", has_text="New Project")

    @property
    def project_cards(self) -> Locator:
        return self.page.locator("#view-projects .grid > div")

    def project_card(self, name: str) -> Locator:
        return self.page.locator("#view-projects .grid > div", has_text=name)

    def delete_btn_for(self, name: str) -> Locator:
        card = self.project_card(name)
        return card.locator("button").nth(0)

    # ── Actions ───────────────────────────────────────────────────────────────
    def open_new_project_modal(self):
        self.new_project_btn.click()
        expect(self.modal_title).to_have_text("New Project")

    def create_project(self, name: str, description: str = ""):
        self.open_new_project_modal()
        self.modal_input("My Project").fill(name)
        if description:
            self.modal_textarea("Optional description").fill(description)
        self.modal_submit("Create Project").click()
        self.page.wait_for_load_state("networkidle")

    def delete_project(self, name: str):
        card = self.project_card(name)
        card.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.delete_btn_for(name).click()
        self.page.wait_for_load_state("networkidle")

    def click_project(self, name: str):
        self.project_card(name).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────
    def expect_loaded(self):
        expect(self.heading).to_be_visible()

    def expect_project_visible(self, name: str):
        expect(self.project_card(name)).to_be_visible()

    def expect_project_not_visible(self, name: str):
        expect(self.project_card(name)).to_be_hidden()

    def expect_empty_state(self):
        expect(self.page.locator("text=Welcome to TestFlow")).to_be_visible()
