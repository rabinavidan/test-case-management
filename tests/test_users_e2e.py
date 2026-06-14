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
    """
    Full flow:
      1. Log in as admin
      2. Navigate to User Management via the Users nav button
      3. Add an executor user
      4. Verify the user appears in the table
      5. Delete the user
      6. Verify the user is removed from the table
    """
    page = logged_in_admin.page

    # Step 2: Navigate to User Management panel via nav button
    users_page.users_btn.click()
    page.wait_for_load_state("networkidle")
    users_page.expect_loaded()

    # Step 3: Add executor user
    users_page.add_executor(EXECUTOR_USERNAME, EXECUTOR_EMAIL, EXECUTOR_PASSWORD)
    users_page.expect_toast(f'Executor "{EXECUTOR_USERNAME}" created')

    # Step 4: Verify user appears in the list
    users_page.expect_user_visible(EXECUTOR_USERNAME)

    # Step 5: Delete the user
    users_page.delete_user(EXECUTOR_USERNAME)
    users_page.expect_toast(f'"{EXECUTOR_USERNAME}" removed')

    # Step 6: Verify user is removed from the list
    users_page.expect_user_not_visible(EXECUTOR_USERNAME)
