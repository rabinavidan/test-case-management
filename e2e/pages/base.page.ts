import { Page } from '@playwright/test';
import { log } from '../logger';

export class BasePage {
  constructor(protected page: Page) {}

  async navigate(path: string): Promise<void> {
    log.navigate(path);
    await this.page.goto(path);
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
