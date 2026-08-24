import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { log } from '../logger';

// Same credentials global-setup.ts registers before the suite runs.
const USERNAME = 'testuser_e2e';
const PASSWORD = 'Test@12345';

test.describe('Sign-in modal', () => {
  test('renders all expected elements when opened', async ({ page }) => {
    log.section('Sign-in modal load');
    const loginPage = new LoginPage(page);
    await loginPage.open();

    await test.step('Assert all elements visible', async () => {
      await loginPage.expectModalLoaded();
      await loginPage.expectContactAdminTextVisible();
    });
  });

  test('valid credentials sign the user in', async ({ page }) => {
    log.section('Successful login');
    const loginPage = new LoginPage(page);
    await loginPage.login(USERNAME, PASSWORD);

    await test.step('Wait for modal to close', async () => {
      await loginPage.expectLoggedIn();
    });
  });

  test('invalid credentials show an error and leave the user logged out', async ({ page }) => {
    log.section('Invalid login');
    const loginPage = new LoginPage(page);
    await loginPage.login(USERNAME, 'not-the-real-password');

    await test.step('Assert error message shown', async () => {
      await loginPage.expectLoginError('Invalid username or password');
    });

    await test.step('Still logged out', async () => {
      await expect(page.getByTestId('signin-btn')).toBeVisible();
    });
  });
});
