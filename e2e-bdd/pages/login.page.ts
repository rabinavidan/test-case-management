import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * POM for TestFlow's auth modal — the BDD suite's own copy, kept independent
 * from ../e2e/pages/login.page.ts on purpose (see e2e-bdd/README.md): every
 * automation stack in this repo (pytest, Playwright TS, REST Assured, Java
 * Playwright) already owns its Page Objects rather than sharing them, and
 * that independence also sidesteps a real TypeScript conflict — two
 * separately-installed @playwright/test copies produce structurally
 * incompatible `Page` types, so importing across the package boundary
 * doesn't type-check cleanly.
 */
export class LoginPage extends BasePage {
  readonly heading:          Locator;
  readonly signInHeading:    Locator;
  readonly usernameInput:    Locator;
  readonly passwordInput:    Locator;
  readonly submitBtn:        Locator;
  readonly authError:        Locator;
  readonly contactAdminText: Locator;

  constructor(page: Page) {
    super(page);
    this.heading          = page.locator('#auth-form-container h1', { hasText: 'TestFlow' });
    this.signInHeading    = page.locator('#auth-form-container h2', { hasText: 'Sign in' });
    this.usernameInput    = page.getByTestId('auth-username');
    this.passwordInput    = page.getByTestId('auth-password');
    this.submitBtn        = page.getByTestId('auth-submit-btn');
    this.authError        = page.locator('#auth-error');
    this.contactAdminText = page.getByText('Contact your admin to get an account.');
  }

  async open(): Promise<void> {
    await this.navigate('/');
    await this.waitForNetworkIdle();
    await this.page.getByTestId('signin-btn').click();
    await expect(this.submitBtn).toBeVisible();
  }

  async login(username: string, password: string): Promise<void> {
    await this.open();
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
  }

  async expectModalLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.signInHeading).toBeVisible();
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitBtn).toBeVisible();
  }

  async expectLoginError(text: string): Promise<void> {
    await expect(this.authError).toBeVisible();
    await expect(this.authError).toContainText(text);
  }

  async expectLoggedIn(): Promise<void> {
    await expect(this.page.getByTestId('logout-btn')).toBeVisible();
  }
}
