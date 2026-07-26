from playwright.sync_api import Locator, expect
from .base_page import BasePage


class UsersPage(BasePage):
    def goto(self):
        self.log.step("Navigate to Users page")
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
        self.log.step("Navigate to Users via nav button")
        self.log.action("click", "Users nav button")
        self.users_btn.click()
        self.page.wait_for_load_state("networkidle")

    def add_executor(self, username: str, email: str, password: str):
        self.log.step(f"Add executor '{username}'")
        self.log.action("click", "Add Executor button")
        self.add_executor_btn.click()
        self.log.assert_("modal title", "Add Executor")
        expect(self.modal_title).to_have_text("Add Executor")
        self.log.action("fill", "username field", username)
        self.modal_body.locator("input[placeholder*='john_doe']").fill(username)
        self.log.action("fill", "email field", email)
        self.modal_body.locator("input[type='email']").fill(email)
        self.log.action("fill", "password field", "***")
        self.modal_body.locator("input[type='password']").fill(password)
        self.log.action("click", "Create Executor submit button")
        self.page.get_by_test_id("modal-submit-btn").click()
        self.page.wait_for_load_state("networkidle")

    def delete_user(self, username: str):
        self.log.step(f"Delete user '{username}'")
        row = self.user_row(username)
        self.log.action("hover", f"user row '{username}'")
        row.hover()
        self.page.once("dialog", lambda d: d.accept())
        self.log.action("click", f"delete button for '{username}'")
        self.delete_btn_for(username).click()
        self.page.wait_for_load_state("networkidle")

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_loaded(self):
        self.log.assert_("Users heading visible")
        expect(self.heading).to_be_visible()

    def expect_user_visible(self, username: str):
        self.log.assert_("user row visible", username)
        expect(self.user_row(username)).to_be_visible()

    def expect_user_not_visible(self, username: str):
        self.log.assert_("user row not visible", username)
        expect(self.user_row(username)).to_be_hidden()
