import { Locator } from '@playwright/test';
import { BasePage } from './base.page';

export type ResultStatus = 'pass' | 'fail' | 'skip';

export class RunPage extends BasePage {
  async goto(runId: string | number): Promise<void> {
    await this.navigate(`/#run/${runId}`);
    await this.page.locator('#ws-indicator').waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
  }

  row(testCaseId: string | number): Locator {
    return this.page.locator(`[data-tc-id="${testCaseId}"]`);
  }

  statusBadge(testCaseId: string | number): Locator {
    return this.row(testCaseId).locator('[data-status-badge]');
  }

  async record(testCaseId: string | number, status: ResultStatus): Promise<void> {
    await this.row(testCaseId).getByRole('button', { name: /record|update/i }).click();
    await this.page.locator(`#rs-${status}`).click();
    await this.page.getByRole('button', { name: /save result/i }).click();
    await this.page.locator('#modal-overlay').waitFor({ state: 'hidden', timeout: this.TIMEOUT_MEDIUM });
  }
}
