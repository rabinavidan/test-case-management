from playwright.sync_api import Locator, expect
from .base_page import BasePage


class UsersPage(BasePage):
    def goto(self):
        super().goto("users")

    # ── Page elements ────────────────────────────────────────────────────────

    @property
    def heading(self) -> Locator:
        return self.page.locator("#view-users h1", has_text="Users")

    @property
    def users_btn(self) -> Locator:
        return self.page.get_by_test_id("users-btn")

    @property
    def add_executor_btn(self) -> Locator:
        return self.page.locator("#view-users button", has_text="Add Executor")

    def user_row(self, username: str) -> Locator:
        return self.page.locator("#view-users tbody tr", has_text=username)

    def delete_btn_for(self, username: str) -> Locator:
        return self.user_row(username).locator("button[title='Remove']")

    # ── Actions ──────────────────────────────────────────────────────────────

    def navigate_via_nav_btn(self):
        self.users_btn.click()
        self.page.wait_for_load_state("networkidle")

    def add_executor(self, username: str, email: str, password: str):
        self.add_executor_btn.click()
        expect(self.modal_title).to_have_text("Add Executor")
        self.modal_body.locator("input[placeholder*='john_doe']").fill(username)
        self.modal_body.locator("input[type='email']").fill(email)
        self.modal_body.locator("input[type='password']").fill(password)
        self.page.get_by_test_id("modal-submit-btn").click()
        self.page.wait_for_load_state("networkidle")

    def delete_user(self, username: str):
        row = self.user_row(username)
        row.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.delete_btn_for(username).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_loaded(self):
        expect(self.heading).to_be_visible()

    def expect_user_visible(self, username: str):
        expect(self.user_row(username)).to_be_visible()

    def expect_user_not_visible(self, username: str):
        expect(self.user_row(username)).to_be_hidden()
