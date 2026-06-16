"""
E2E tests for the TestManager login page at /login.

Covers:
  - Page loads with all expected elements
  - Valid credentials → successful sign-in (redirected away from /login)
  - "Create a new account" link navigates to /signup
"""
import os
import pytest
from playwright.sync_api import Page, expect
from tests.pages.login_page import LoginPage
from tests.logger import PWLogger

BASE_URL    = "https://test-case-management.vercel.app"
TEST_EMAIL    = os.environ.get("LOGIN_EMAIL",    "e2eadmin@test.com")
TEST_PASSWORD = os.environ.get("LOGIN_PASSWORD", "e2epass1")

log = PWLogger("test_login_e2e")


@pytest.fixture
def login_page(page: Page) -> LoginPage:
    return LoginPage(page, BASE_URL)


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.regression
def test_login_page_loads(login_page: LoginPage):
    """Login page renders all key elements."""
    log.section("Login page load")
    log.step("Navigate to /login")
    login_page.navigate()

    log.step("Assert all elements visible")
    login_page.expect_page_loaded()
    login_page.expect_create_account_link_visible()
    log.assert_("login page fully rendered")


@pytest.mark.regression
def test_login_success(login_page: LoginPage, page: Page):
    """Valid credentials → user is redirected away from /login."""
    log.section("Successful login")
    login_page.login(email=TEST_EMAIL, password=TEST_PASSWORD)

    log.step("Wait for redirect after sign-in")
    page.wait_for_load_state("networkidle")

    log.assert_("URL no longer /login after success")
    expect(page).not_to_have_url(f"{BASE_URL}/login")


@pytest.mark.regression
def test_create_account_link_navigates_to_signup(login_page: LoginPage, page: Page):
    """'Create a new account' link navigates to /signup."""
    log.section("Create account link")
    log.step("Navigate to /login")
    login_page.navigate()

    log.step("Click 'create a new account' link")
    login_page.create_account_link.click()
    page.wait_for_load_state("networkidle")

    log.assert_("URL is /signup")
    expect(page).to_have_url(f"{BASE_URL}/signup")
