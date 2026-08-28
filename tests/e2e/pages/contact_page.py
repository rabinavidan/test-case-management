from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class ContactPage(BasePage):
    """POM for the public "Contact Us" modal (footer link, no login required —
    see buildContactModal/submitContact in static/app.js).

    HTML landmarks:
      [data-testid=contact-us-btn] — footer link that opens the modal
      #f-topic / #f-email / #f-phone / #f-description — form fields
      #f-desc-count                — live "characters left" counter
      [data-testid=modal-submit-btn] — Send button
    """

    def __init__(self, page: Page, base_url: str):
        super().__init__(page, base_url)

    # ── Locators ──────────────────────────────────────────────────────────────

    @property
    def open_btn(self) -> Locator:
        return self.page.get_by_test_id("contact-us-btn")

    @property
    def topic_input(self) -> Locator:
        return self.page.locator("#f-topic")

    @property
    def email_input(self) -> Locator:
        return self.page.locator("#f-email")

    @property
    def phone_input(self) -> Locator:
        return self.page.locator("#f-phone")

    @property
    def description_input(self) -> Locator:
        return self.page.locator("#f-description")

    @property
    def char_count(self) -> Locator:
        return self.page.locator("#f-desc-count")

    @property
    def send_btn(self) -> Locator:
        return self.page.get_by_test_id("modal-submit-btn")

    # ── Actions ───────────────────────────────────────────────────────────────

    def open(self):
        """Load the app as a guest (no login) and open the Contact Us modal."""
        self.log.step("Open Contact Us modal")
        self.goto()
        self.open_btn.click()
        self.log.assert_("contact modal visible")
        expect(self.topic_input).to_be_visible()

    def fill(self, topic: str, email: str, phone: str, description: str):
        self.log.action("fill", "topic field", topic)
        self.topic_input.fill(topic)
        self.log.action("fill", "email field", email)
        self.email_input.fill(email)
        self.log.action("fill", "phone field", phone)
        self.phone_input.fill(phone)
        self.log.action("fill", "description field", description)
        self.description_input.fill(description)

    def submit(self):
        self.log.action("click", "Send button")
        self.send_btn.click()

    def submit_contact(self, topic: str, email: str, phone: str, description: str):
        self.open()
        self.fill(topic, email, phone, description)
        self.submit()

    # ── Assertions ────────────────────────────────────────────────────────────

    def expect_modal_loaded(self):
        self.log.assert_("contact modal fully rendered")
        expect(self.topic_input).to_be_visible()
        expect(self.email_input).to_be_visible()
        expect(self.phone_input).to_be_visible()
        expect(self.description_input).to_be_visible()
        expect(self.send_btn).to_be_visible()

    def expect_char_count(self, remaining: int):
        self.log.assert_("character counter", str(remaining))
        expect(self.char_count).to_have_text(str(remaining))

    def expect_sent(self):
        self.log.assert_("success toast shown, modal closed")
        self.expect_toast("Message sent")
        expect(self.modal_overlay).to_be_hidden()
