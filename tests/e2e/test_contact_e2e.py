"""
E2E tests for TestFlow's public "Contact Us" form (footer modal).

Covers:
  - Modal opens (no login required) and renders all expected fields
  - Live character counter updates as the description is typed
  - Valid submission → success toast, modal closes
  - Missing a required field → blocked client-side before any network call
"""
import pytest
from playwright.sync_api import Page
from tests.e2e.pages.contact_page import ContactPage
from tests.e2e.logger import PWLogger

log = PWLogger("test_contact_e2e")


@pytest.fixture
def contact_page(page: Page, base_url: str) -> ContactPage:
    return ContactPage(page, base_url)


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.regression
def test_contact_modal_loads_without_login(contact_page: ContactPage):
    """The Contact Us link is reachable and usable by a logged-out visitor."""
    log.section("Contact modal load (guest)")
    contact_page.open()

    log.step("Assert all fields visible")
    contact_page.expect_modal_loaded()
    log.assert_("contact modal fully rendered for a guest")


@pytest.mark.regression
def test_contact_character_counter_updates_live(contact_page: ContactPage):
    """Typing into the description field live-updates the '{n} characters left' counter."""
    log.section("Live character counter")
    contact_page.open()

    log.step("Type a 20-character message")
    contact_page.description_input.fill("x" * 20)
    contact_page.expect_char_count(480)


@pytest.mark.regression
def test_contact_valid_submission_shows_success(contact_page: ContactPage):
    """Filling all fields and sending shows a success toast and closes the modal."""
    log.section("Successful contact submission")
    contact_page.submit_contact(
        topic="E2E Test — please ignore",
        email="e2e-test@example.com",
        phone="+1 555 000 0000",
        description="Automated Playwright E2E regression test — safe to disregard.",
    )

    log.step("Wait for success toast")
    contact_page.expect_sent()


@pytest.mark.regression
def test_contact_missing_field_is_blocked_client_side(contact_page: ContactPage):
    """An incomplete form is rejected before any request is sent (see submitContact)."""
    log.section("Incomplete contact form")
    contact_page.open()
    contact_page.fill(topic="Missing email test", email="", phone="555", description="Body text")

    log.step("Click Send with email left blank")
    contact_page.submit()

    log.assert_("client-side validation toast shown")
    contact_page.expect_toast("Please fill in all fields")
