from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class ProjectsPage(BasePage):
    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    def goto(self):
        self.log.step("Navigate to Projects page")
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
    def project_rows(self) -> Locator:
        return self.page.locator("[data-testid^='project-row-']")

    def project_row(self, name: str) -> Locator:
        return self.page.locator("[data-testid^='project-row-']", has_text=name)

    def project_card(self, name: str) -> Locator:
        return self.project_row(name)

    def delete_btn_for(self, name: str) -> Locator:
        row = self.project_row(name)
        return row.locator("[data-testid^='delete-project-']")

    # ── Actions ───────────────────────────────────────────────────────────────
    def open_new_project_modal(self):
        self.log.action("click", "New Project button")
        self.new_project_btn.click()
        self.log.assert_("modal title", "New Project")
        expect(self.modal_title).to_have_text("New Project")

    def create_project(self, name: str, description: str = ""):
        self.log.step(f"Create project '{name}'")
        self.open_new_project_modal()
        self.log.action("fill", "project name", name)
        self.modal_input("My Project").fill(name)
        if description:
            self.log.action("fill", "project description", description)
            self.modal_textarea("Optional description").fill(description)
        self.log.action("click", "Create Project submit button")
        self.modal_submit("Create Project").click()
        self.page.wait_for_load_state("networkidle")

    def delete_project(self, name: str):
        self.log.step(f"Delete project '{name}'")
        card = self.project_card(name)
        self.log.action("hover", f"project card '{name}'")
        card.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.log.action("click", f"delete button for '{name}'")
        self.delete_btn_for(name).click()
        self.page.wait_for_load_state("networkidle")
        self.log.assert_("project deleted", name)

    def click_project(self, name: str):
        self.log.action("click", f"project card '{name}'")
        self.project_card(name).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────
    def expect_loaded(self):
        self.log.assert_("Projects heading visible")
        expect(self.heading).to_be_visible()

    def expect_project_visible(self, name: str):
        self.log.assert_("project card visible", name)
        expect(self.project_card(name)).to_be_visible()

    def expect_project_not_visible(self, name: str):
        self.log.assert_("project card not visible", name)
        expect(self.project_card(name)).to_be_hidden()

    def expect_empty_state(self):
        self.log.assert_("empty state visible")
        expect(self.page.locator("text=Welcome to TestFlow")).to_be_visible()
