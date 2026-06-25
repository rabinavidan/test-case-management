import { Page } from '@playwright/test';
import { BasePage } from './base.page';

export interface RunSummary {
  pass: number;
  fail: number;
  skip: number;
  pending: number;
}

export class RunPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#run/${id}`);
    await this.waitForNetworkIdle();
  }

  async markResult(testCaseTitle: string, status: 'pass' | 'fail' | 'skip', notes?: string): Promise<void> {
    const row = this.page.locator('tr, .result-row, [data-testid="result-row"]').filter({ hasText: testCaseTitle });

    if (notes) {
      const notesInput = row.getByPlaceholder(/notes/i);
      if (await notesInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await notesInput.fill(notes);
      }
    }

    // Try button with status name first, then radio/select
    const statusBtn = row.getByRole('button', { name: new RegExp(status, 'i') });
    if (await statusBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await statusBtn.click();
    } else {
      const radio = row.getByRole('radio', { name: new RegExp(status, 'i') });
      if (await radio.isVisible({ timeout: 1000 }).catch(() => false)) {
        await radio.click();
      } else {
        const select = row.locator('select');
        await select.selectOption(status);
      }
    }

    await this.waitForNetworkIdle();
  }

  async getSummary(): Promise<RunSummary> {
    const summary = this.page.locator('[data-testid="run-summary"], .run-summary, .summary');
    const text = await summary.textContent() || '';

    return {
      pass: parseInt(text.match(/(\d+)\s*pass(ed)?/i)?.[1] || '0', 10),
      fail: parseInt(text.match(/(\d+)\s*fail(ed)?/i)?.[1] || '0', 10),
      skip: parseInt(text.match(/(\d+)\s*skip(ped)?/i)?.[1] || '0', 10),
      pending: parseInt(text.match(/(\d+)\s*pending/i)?.[1] || '0', 10),
    };
  }
}
