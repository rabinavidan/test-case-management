import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export interface TestCaseData {
  title: string;
  description?: string;
  steps?: string;
  expected?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'active' | 'draft' | 'deprecated';
}

export class SuitePage extends BasePage {
  readonly newTestCaseBtn: Locator;
  readonly titleInput:     Locator;
  readonly descInput:      Locator;
  readonly stepsInput:     Locator;
  readonly expectedInput:  Locator;
  readonly prioritySelect: Locator;
  readonly statusSelect:   Locator;
  readonly submitBtn:      Locator;
  readonly startRunBtn:    Locator;
  readonly runNameInput:   Locator;
  readonly modalBody:      Locator;

  constructor(page: Page) {
    super(page);
    this.newTestCaseBtn = page.getByTestId('nav-new-btn');
    this.titleInput     = page.locator('[data-testid="f-title"], #f-title');
    this.descInput      = page.locator('[data-testid="f-desc"], #f-desc');
    this.stepsInput     = page.locator('[data-testid="f-steps"], #f-steps');
    this.expectedInput  = page.locator('[data-testid="f-expected"], #f-expected');
    this.prioritySelect = page.locator('[data-testid="f-priority"], #f-priority');
    this.statusSelect   = page.locator('[data-testid="f-status"], #f-status');
    this.submitBtn      = page.getByTestId('modal-submit-btn');
    this.startRunBtn    = page.getByRole('button', { name: /start run|new run|create run/i });
    this.runNameInput   = page.locator('#f-name');
    this.modalBody      = page.getByTestId('modal-body');
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#suite/${id}`);
    await this.waitForNetworkIdle();
  }

  async clickNewTestCase(): Promise<void> {
    log.action('click', 'New Test Case button');
    await this.newTestCaseBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.newTestCaseBtn.click();
  }

  async fillTestCaseForm(data: TestCaseData): Promise<void> {
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
    await this.waitForNetworkIdle();
  }

  getTestCaseRows(): Locator {
    return this.page.locator('[data-testid="testcase-row"], .testcase-row, tbody tr, .test-case-item').filter({ hasText: /./ });
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
    await this.waitForNetworkIdle();
  }

  async startRun(name: string): Promise<number> {
    await this.clickStartRun();
    await this.fillRunForm(name);
    await this.submitRunForm();
    await this.page.waitForURL(/run\/\d+/, { timeout: 10000 });
    const url = this.page.url();
    const match = url.match(/run\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
