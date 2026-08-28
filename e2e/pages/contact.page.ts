import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

/**
 * POM for the public "Contact Us" modal (footer link, no login required —
 * see buildContactModal/submitContact in static/app.js).
 *
 * HTML landmarks:
 *   [data-testid=contact-us-btn]   — footer link that opens the modal
 *   #f-topic / #f-email / #f-phone / #f-description — form fields
 *   #f-desc-count                  — live "characters left" counter
 *   [data-testid=modal-submit-btn] — Send button
 *   [data-testid=toast-inner]      — success/error toast
 */
export class ContactPage extends BasePage {
  readonly openBtn:         Locator;
  readonly topicInput:      Locator;
  readonly emailInput:      Locator;
  readonly phoneInput:      Locator;
  readonly descriptionInput: Locator;
  readonly charCount:       Locator;
  readonly sendBtn:         Locator;
  readonly toast:           Locator;
  readonly modalOverlay:    Locator;

  constructor(page: Page) {
    super(page);
    this.openBtn          = page.getByTestId('contact-us-btn');
    this.topicInput       = page.locator('#f-topic');
    this.emailInput       = page.locator('#f-email');
    this.phoneInput       = page.locator('#f-phone');
    this.descriptionInput = page.locator('#f-description');
    this.charCount        = page.locator('#f-desc-count');
    this.sendBtn          = page.getByTestId('modal-submit-btn');
    this.toast            = page.getByTestId('toast-inner');
    this.modalOverlay     = page.getByTestId('modal-overlay');
  }

  /** Load the app as a guest (no login) and open the Contact Us modal. */
  async open(): Promise<void> {
    log.step('Open Contact Us modal');
    await this.navigate('/');
    await this.waitForNetworkIdle();
    await this.openBtn.click();
    await expect(this.topicInput).toBeVisible();
    log.assert('contact modal visible');
  }

  async fill(topic: string, email: string, phone: string, description: string): Promise<void> {
    log.action('fill', 'topic field', topic);
    await this.topicInput.fill(topic);
    log.action('fill', 'email field', email);
    await this.emailInput.fill(email);
    log.action('fill', 'phone field', phone);
    await this.phoneInput.fill(phone);
    log.action('fill', 'description field', description);
    await this.descriptionInput.fill(description);
  }

  async submit(): Promise<void> {
    log.action('click', 'Send button');
    await this.sendBtn.click();
  }

  async submitContact(topic: string, email: string, phone: string, description: string): Promise<void> {
    await this.open();
    await this.fill(topic, email, phone, description);
    await this.submit();
  }

  async expectModalLoaded(): Promise<void> {
    log.assert('contact modal fully rendered');
    await expect(this.topicInput).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.phoneInput).toBeVisible();
    await expect(this.descriptionInput).toBeVisible();
    await expect(this.sendBtn).toBeVisible();
  }

  async expectCharCount(remaining: number): Promise<void> {
    log.assert('character counter', String(remaining));
    await expect(this.charCount).toHaveText(String(remaining));
  }

  async expectSent(): Promise<void> {
    log.assert('success toast shown, modal closed');
    await expect(this.toast).toContainText('Message sent');
    await expect(this.modalOverlay).toBeHidden();
  }

  async expectToast(text: string): Promise<void> {
    log.assert('toast visible', text);
    await expect(this.toast).toContainText(text);
  }
}
