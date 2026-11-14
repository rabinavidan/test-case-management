import { Page, Locator, Download } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';
import type { TestCaseInput } from '../data/types';

/** @deprecated Kept as an alias for existing imports; use TestCaseInput. */
export type TestCaseData = TestCaseInput;

export class SuitePage extends BasePage {
  readonly newTestCaseBtn: Locator;
  readonly titleInput:     Locator;
  readonly descInput:      Locator;
  readonly stepsInput:     Locator;
  readonly expectedInput:  Locator;
  readonly prioritySelect: Locator;
  readonly statusSelect:   Locator;
  readonly submitBtn:      Locator;
  readonly saveChangesBtn: Locator;
  readonly startRunBtn:    Locator;
  readonly runNameInput:   Locator;
  readonly modalBody:      Locator;
  readonly exportCsvBtn:   Locator;

  constructor(page: Page) {
    super(page);
    this.newTestCaseBtn = page.getByTestId('new-testcase-btn');
    this.titleInput     = page.locator('#f-title');
    this.descInput      = page.locator('#f-desc');
    this.stepsInput     = page.locator('#f-steps');
    this.expectedInput  = page.locator('#f-expected');
    this.prioritySelect = page.locator('#f-priority');
    this.statusSelect   = page.getByTestId('f-status');
    this.submitBtn      = page.getByTestId('modal-submit-btn');
    this.saveChangesBtn = page.getByRole('button', { name: /save changes/i });
    this.startRunBtn    = page.getByRole('button', { name: /start run|new run|create run/i });
    this.runNameInput   = page.locator('#f-name');
    this.modalBody      = page.getByTestId('modal-body');
    this.exportCsvBtn   = page.getByTestId('export-csv-btn');
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#suite/${id}`);
    await this.waitForView('view-suite');
  }

  async clickNewTestCase(): Promise<void> {
    log.action('click', 'New Test Case button');
    await this.newTestCaseBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.newTestCaseBtn.click();
  }

  async fillTestCaseForm(data: TestCaseInput): Promise<void> {
    log.action('fill', 'title', data.title);
    await this.titleInput.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.titleInput.fill(data.title);

    if (data.description) {
      log.action('fill', 'description', data.description);
      await this.descInput.fill(data.description);
    }
    if (data.steps) {
      log.action('fill', 'steps');
      await this.stepsInput.fill(data.steps);
    }
    if (data.expected) {
      log.action('fill', 'expected result');
      await this.expectedInput.fill(data.expected);
    }
    if (data.priority) {
      log.action('select', 'priority', data.priority);
      await this.prioritySelect.selectOption(data.priority);
    }
    if (data.status) {
      log.action('select', 'status', data.status);
      await this.statusSelect.selectOption(data.status);
    }
  }

  async submitTestCaseForm(): Promise<void> {
    log.action('click', 'Submit test case form');
    await this.submitBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_SHORT });
    await this.submitBtn.click();
    await this.waitForModalClosed();
  }

  getTestCaseRows(): Locator {
    return this.page.locator('[data-testid^="testcase-card-"]').filter({ hasText: /./ });
  }

  testCaseCard(title: string): Locator {
    return this.getTestCaseRows().filter({ hasText: title });
  }

  /** The priority badge on a test case card (e.g. "critical"). */
  priorityBadge(title: string, priority: string): Locator {
    return this.testCaseCard(title).getByText(priority, { exact: true });
  }

  async renameTestCase(testCaseId: number, newTitle: string): Promise<void> {
    log.action('edit', `test case ${testCaseId} title`, newTitle);
    await this.page.getByTestId(`edit-testcase-${testCaseId}`).click();
    await this.titleInput.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.titleInput.fill(newTitle);
    await this.saveChangesBtn.click();
    await this.waitForModalClosed();
  }

  async deleteTestCase(testCaseId: number): Promise<void> {
    log.action('delete', `test case ${testCaseId}`);
    this.page.once('dialog', d => d.accept());
    await this.page.getByTestId(`delete-testcase-${testCaseId}`).click();
  }

  /** Clicks Export CSV and returns the download (the caller inspects it). */
  async exportCsv(): Promise<Download> {
    log.action('click', 'Export CSV');
    const download = this.page.waitForEvent('download');
    await this.exportCsvBtn.click();
    return download;
  }

  async clickStartRun(): Promise<void> {
    log.action('click', 'Start Run button');
    await this.startRunBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.startRunBtn.click();
  }

  async fillRunForm(name: string): Promise<void> {
    log.action('fill', 'run name', name);
    await this.runNameInput.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.runNameInput.fill(name);
  }

  async submitRunForm(): Promise<void> {
    log.action('click', 'Submit run form');
    const submitBtn = this.modalBody.getByRole('button', { name: /start run/i });
    await submitBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_SHORT });
    await submitBtn.click();
  }

  /** Starts a run from this suite and returns its id (read from the URL it navigates to). */
  async startRun(name: string): Promise<number> {
    await this.clickStartRun();
    await this.fillRunForm(name);
    await this.submitRunForm();
    await this.page.waitForURL(/run\/\d+/, { timeout: this.TIMEOUT_MEDIUM });
    const match = this.page.url().match(/run\/(\d+)/);
    if (!match) throw new Error(`Started run "${name}" but the URL has no run id: ${this.page.url()}`);
    return parseInt(match[1], 10);
  }
}
