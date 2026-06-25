import { Page } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

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
    log.action('mark', `"${testCaseTitle}"`, status);

    // Result rows are divs in .space-y-3; click the Record/Update button to open modal
    const row = this.page.locator('.space-y-3 > div').filter({ hasText: testCaseTitle });
    await row.getByRole('button', { name: /record|update/i }).click();

    // Click the status button in the modal (id="rs-{status}")
    await this.page.locator(`#rs-${status}`).click();

    if (notes) {
      const notesField = this.page.locator('#f-notes');
      if (await notesField.isVisible({ timeout: 1000 }).catch(() => false)) {
        log.action('fill', 'notes', notes);
        await notesField.fill(notes);
      }
    }

    // Submit the result
    await this.page.getByRole('button', { name: /save result/i }).click();
    await this.waitForNetworkIdle();
  }

  async getSummary(): Promise<RunSummary> {
    log.step('Reading run summary');

    // Summary grid: 4 cells in order — Pass, Fail, Skip, Pending
    const cells = this.page.locator('#view-run .grid-cols-4 > div');
    const passText    = await cells.nth(0).textContent() || '0';
    const failText    = await cells.nth(1).textContent() || '0';
    const skipText    = await cells.nth(2).textContent() || '0';
    const pendingText = await cells.nth(3).textContent() || '0';

    const result = {
      pass:    parseInt(passText.match(/\d+/)?.[0]    || '0', 10),
      fail:    parseInt(failText.match(/\d+/)?.[0]    || '0', 10),
      skip:    parseInt(skipText.match(/\d+/)?.[0]    || '0', 10),
      pending: parseInt(pendingText.match(/\d+/)?.[0] || '0', 10),
    };
    log.info(`Summary → pass:${result.pass} fail:${result.fail} skip:${result.skip} pending:${result.pending}`);
    return result;
  }
}
