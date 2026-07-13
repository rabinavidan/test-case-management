"""
E2E tests for TestFlow's sign-in modal.

Covers:
  - Modal renders all expected elements when opened
  - Valid credentials → successful sign-in (logout button appears)
  - Invalid credentials → error message shown, user stays logged out
"""
import os
import pytest
from playwright.sync_api import Page, expect
from tests.pages.login_page import LoginPage
from tests.logger import PWLogger

TEST_USERNAME = os.environ.get("E2E_USERNAME", "e2eadmin")
TEST_PASSWORD = os.environ.get("E2E_PASSWORD", "e2epass1")

log = PWLogger("test_login_e2e")


@pytest.fixture
def login_page(page: Page, base_url: str) -> LoginPage:
    return LoginPage(page, base_url)


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.regression
def test_login_page_loads(login_page: LoginPage):
    """Sign-in modal renders all key elements."""
    log.section("Sign-in modal load")
    login_page.open()

    log.step("Assert all elements visible")
    login_page.expect_modal_loaded()
    login_page.expect_contact_admin_text_visible()
    log.assert_("sign-in modal fully rendered")


@pytest.mark.regression
def test_login_success(login_page: LoginPage):
    """Valid credentials → user is signed in."""
    log.section("Successful login")
    login_page.login(username=TEST_USERNAME, password=TEST_PASSWORD)

    log.step("Wait for modal to close")
    login_page.expect_logged_in()


@pytest.mark.regression
def test_login_invalid_credentials_shows_error(login_page: LoginPage):
    """Wrong password → error message shown, user remains logged out."""
    log.section("Invalid login")
    login_page.login(username=TEST_USERNAME, password="not-the-real-password")

    log.step("Assert error message shown")
    login_page.expect_login_error("Invalid username or password")

    log.assert_("still logged out")
    expect(login_page.page.get_by_test_id("signin-btn")).to_be_visible()
