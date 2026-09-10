import { Page } from '@playwright/test';

export class BasePage {
  protected readonly TIMEOUT_SHORT  = 5_000;
  protected readonly TIMEOUT_MEDIUM = 10_000;

  constructor(protected page: Page) {}

  async navigate(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
