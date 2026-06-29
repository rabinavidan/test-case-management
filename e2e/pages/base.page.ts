import { Page } from '@playwright/test';
import { log } from '../logger';

export class BasePage {
  protected readonly TIMEOUT_SHORT  = 5_000;
  protected readonly TIMEOUT_MEDIUM = 10_000;
  protected readonly TIMEOUT_LONG   = 30_000;

  constructor(protected page: Page) {}

  async navigate(path: string): Promise<void> {
    log.navigate(path);
    await this.page.goto(path);
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
