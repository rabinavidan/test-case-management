import { test, expect } from '@playwright/test';
import { ContactPage } from '../pages/contact.page';
import { log } from '../logger';

test.describe('Contact Us modal', () => {
  test('opens and renders all fields without login', async ({ page }) => {
    log.section('Contact modal load (guest)');
    const contactPage = new ContactPage(page);
    await contactPage.open();

    await test.step('Assert all fields visible', async () => {
      await contactPage.expectModalLoaded();
    });
  });

  test('character counter updates live as the message is typed', async ({ page }) => {
    log.section('Live character counter');
    const contactPage = new ContactPage(page);
    await contactPage.open();

    await test.step('Type a 20-character message', async () => {
      await contactPage.descriptionInput.fill('x'.repeat(20));
      await contactPage.expectCharCount(480);
    });
  });

  test('valid submission shows a success toast and closes the modal', async ({ page }) => {
    log.section('Successful contact submission');
    const contactPage = new ContactPage(page);
    await contactPage.submitContact(
      'E2E Test — please ignore',
      'e2e-test@example.com',
      '+1 555 000 0000',
      'Automated Playwright E2E test — safe to disregard.',
    );

    await test.step('Wait for success toast', async () => {
      await contactPage.expectSent();
    });
  });

  test('an incomplete form is blocked client-side before any request', async ({ page }) => {
    log.section('Incomplete contact form');
    const contactPage = new ContactPage(page);
    await contactPage.open();
    await contactPage.fill('Missing email test', '', '555', 'Body text');

    await test.step('Click Send with email left blank', async () => {
      await contactPage.submit();
    });

    await test.step('Client-side validation toast shown', async () => {
      await contactPage.expectToast('Please fill in all fields');
    });
  });
});
