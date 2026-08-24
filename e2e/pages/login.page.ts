import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

/**
 * POM for TestFlow's auth modal (there is no dedicated /login or /signup route —
 * sign-in is a modal triggered by the 'Sign in' button on any page).
 *
 * HTML landmarks (see showAuthModal/renderAuthForm in static/app.js):
 *   [data-testid=signin-btn]      — opens the modal
 *   [data-testid=auth-username]   — username input
 *   [data-testid=auth-password]   — password input
 *   [data-testid=auth-submit-btn] — submit button
 *   #auth-error                   — validation/auth failure message
 */
export class LoginPage extends BasePage {
  readonly heading:         Locator;
  readonly signInHeading:   Locator;
  readonly usernameInput:   Locator;
  readonly passwordInput:   Locator;
  readonly submitBtn:       Locator;
  readonly authError:       Locator;
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

  /** Load the app as a guest and open the sign-in modal. */
  async open(): Promise<void> {
    log.step('Open sign-in modal');
    await this.navigate('/');
    await this.waitForNetworkIdle();
    await this.page.getByTestId('signin-btn').click();
    await expect(this.submitBtn).toBeVisible();
    log.assert('auth modal visible');
  }

  /** Open the sign-in modal and submit credentials (does not assume success). */
  async login(username: string, password: string): Promise<void> {
    log.step(`Attempt login as '${username}'`);
    await this.open();
    log.action('fill', 'username field', username);
    await this.usernameInput.fill(username);
    log.action('fill', 'password field', '***');
    await this.passwordInput.fill(password);
    log.action('click', 'Sign in submit button');
    await this.submitBtn.click();
  }

  async expectModalLoaded(): Promise<void> {
    log.assert('auth modal fully rendered');
    await expect(this.heading).toBeVisible();
    await expect(this.signInHeading).toBeVisible();
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitBtn).toBeVisible();
  }

  async expectContactAdminTextVisible(): Promise<void> {
    log.assert("'contact your admin' message visible");
    await expect(this.contactAdminText).toBeVisible();
  }

  async expectLoginError(text: string): Promise<void> {
    log.assert('auth error visible', text);
    await expect(this.authError).toBeVisible();
    await expect(this.authError).toContainText(text);
  }

  async expectLoggedIn(): Promise<void> {
    log.assert('logged in — logout button visible');
    await expect(this.page.getByTestId('logout-btn')).toBeVisible();
  }
}
