import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';
import type { ResultStatus, RunTileStatus } from '../data/types';

export interface RunSummary {
  pass: number;
  fail: number;
  skip: number;
  pending: number;
}

export class RunPage extends BasePage {
  readonly resultRows:   Locator;
  readonly modalOverlay: Locator;
  readonly notesInput:   Locator;
  readonly saveResultBtn: Locator;

  constructor(page: Page) {
    super(page);
    // One row per test case: <div data-tc-id=… role="group"> inside #results-list.
    this.resultRows    = page.locator('#results-list > [data-tc-id]');
    this.modalOverlay  = page.locator('#modal-overlay');
    this.notesInput    = page.locator('#f-notes');
    this.saveResultBtn = page.getByRole('button', { name: /save result/i });
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#run/${id}`);
    await this.waitForView('view-run');
  }

  resultRow(testCaseTitle: string): Locator {
    return this.resultRows.filter({ hasText: testCaseTitle });
  }

  /**
   * The number on one of the four summary tiles (Pass / Fail / Skip /
   * Pending) — a Locator, so a spec can assert it web-first
   * (`toHaveText('1')`) and let Playwright retry while the run re-renders.
   */
  summaryCount(status: RunTileStatus): Locator {
    return this.page.getByTestId(`run-filter-${status}`).locator('p').first();
  }

  async markResult(testCaseTitle: string, status: ResultStatus, notes?: string): Promise<void> {
    log.action('mark', `"${testCaseTitle}"`, status);

    const recordBtn = this.resultRow(testCaseTitle).getByRole('button', { name: /record|update/i });
    await recordBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await recordBtn.click();

    await this.page.locator(`#rs-${status}`).click();

    if (notes) {
      log.action('fill', 'notes', notes);
      await this.notesInput.fill(notes);
    }

    await this.saveResultBtn.click();
    try {
      await this.modalOverlay.waitFor({ state: 'hidden', timeout: this.TIMEOUT_MEDIUM });
    } catch {
      // webkit: modal may not auto-dismiss; close with Escape
      await this.page.keyboard.press('Escape');
      await this.modalOverlay.waitFor({ state: 'hidden', timeout: this.TIMEOUT_SHORT });
    }
  }

  /** Snapshot read of all four tiles; prefer summaryCount() for assertions. */
  async getSummary(): Promise<RunSummary> {
    log.step('Reading run summary');
    const read = async (status: RunTileStatus): Promise<number> =>
      parseInt((await this.summaryCount(status).textContent())?.trim() || '0', 10);

    const result = {
      pass:    await read('pass'),
      fail:    await read('fail'),
      skip:    await read('skip'),
      pending: await read('pending'),
    };
    log.info(`Summary → pass:${result.pass} fail:${result.fail} skip:${result.skip} pending:${result.pending}`);
    return result;
  }
}
