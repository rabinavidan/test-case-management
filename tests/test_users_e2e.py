"""
E2E tests for Admin User Management panel.

Flow under test:
  1. Log in as administrator
  2. Navigate to User Management panel
  3. Add an executor user
  4. Verify the new user appears in the list
  5. Delete the user
  6. Verify the user is removed from the list

Run with:
  pytest tests/test_users_e2e.py --base-url=https://your-app.vercel.app -v
"""
import pytest
from playwright.sync_api import Page, expect
from tests.pages import ProjectsPage
from tests.pages.users_page import UsersPage
from tests.logger import PWLogger

pytestmark = pytest.mark.regression

_log = PWLogger("test_users_e2e")


EXECUTOR_USERNAME = "pw_executor"
EXECUTOR_EMAIL = "pw_executor@test.com"
EXECUTOR_PASSWORD = "testpass1"


@pytest.fixture()
def logged_in_admin(page: Page, base_url: str) -> ProjectsPage:
    p = ProjectsPage(page, base_url)
    p.goto()
    p.login()
    return p


@pytest.fixture()
def users_page(page: Page, base_url: str) -> UsersPage:
    return UsersPage(page, base_url)


def test_user_management_full_flow(logged_in_admin: ProjectsPage, users_page: UsersPage):
    _log.section("User Management — Full CRUD flow")
    page = logged_in_admin.page

    _log.step("Navigate to User Management panel via nav button")
    users_page.users_btn.click()
    page.wait_for_load_state("networkidle")
    users_page.expect_loaded()

    _log.step(f"Add executor '{EXECUTOR_USERNAME}'")
    users_page.add_executor(EXECUTOR_USERNAME, EXECUTOR_EMAIL, EXECUTOR_PASSWORD)
    users_page.expect_toast(f'Executor "{EXECUTOR_USERNAME}" created')

    _log.step(f"Verify '{EXECUTOR_USERNAME}' appears in the user list")
    users_page.expect_user_visible(EXECUTOR_USERNAME)

    _log.step(f"Delete user '{EXECUTOR_USERNAME}'")
    users_page.delete_user(EXECUTOR_USERNAME)
    users_page.expect_toast(f'"{EXECUTOR_USERNAME}" removed')

    _log.step(f"Verify '{EXECUTOR_USERNAME}' is removed from the list")
    users_page.expect_user_not_visible(EXECUTOR_USERNAME)
    _log.info("User management flow complete ✔")
