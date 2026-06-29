import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export interface RunSummary {
  pass: number;
  fail: number;
  skip: number;
  pending: number;
}

export class RunPage extends BasePage {
  readonly resultRows:   Locator;
  readonly summaryGrid:  Locator;
  readonly modalOverlay: Locator;

  constructor(page: Page) {
    super(page);
    this.resultRows   = page.locator('.space-y-3 > div');
    this.summaryGrid  = page.locator('#view-run .grid-cols-4 > div');
    this.modalOverlay = page.locator('#modal-overlay');
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#run/${id}`);
    await this.waitForNetworkIdle();
  }

  async markResult(testCaseTitle: string, status: 'pass' | 'fail' | 'skip', notes?: string): Promise<void> {
    log.action('mark', `"${testCaseTitle}"`, status);

    const row = this.resultRows.filter({ hasText: testCaseTitle });
    await row.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    const recordBtn = row.getByRole('button', { name: /record|update/i });
    await recordBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await recordBtn.click();

    await this.page.locator(`#rs-${status}`).click();

    if (notes) {
      const notesField = this.page.locator('#f-notes');
      if (await notesField.isVisible({ timeout: 1000 }).catch(() => false)) {
        log.action('fill', 'notes', notes);
        await notesField.fill(notes);
      }
    }

    await this.page.getByRole('button', { name: /save result/i }).click();
    try {
      await this.modalOverlay.waitFor({ state: 'hidden', timeout: this.TIMEOUT_MEDIUM });
    } catch {
      // webkit: modal may not auto-dismiss; close with Escape
      await this.page.keyboard.press('Escape');
      await this.modalOverlay.waitFor({ state: 'hidden', timeout: this.TIMEOUT_SHORT });
    }
    await this.waitForNetworkIdle();
  }

  async getSummary(): Promise<RunSummary> {
    log.step('Reading run summary');

    const getCount = async (label: string): Promise<number> => {
      const cell = this.summaryGrid.filter({ hasText: label });
      const text = await cell.textContent() || '0';
      return parseInt(text.match(/\d+/)?.[0] || '0', 10);
    };

    const result = {
      pass:    await getCount('Pass'),
      fail:    await getCount('Fail'),
      skip:    await getCount('Skip'),
      pending: await getCount('Pending'),
    };
    log.info(`Summary → pass:${result.pass} fail:${result.fail} skip:${result.skip} pending:${result.pending}`);
    return result;
  }
}
