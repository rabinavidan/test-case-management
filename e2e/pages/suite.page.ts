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
  constructor(page: Page) {
    super(page);
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#suite/${id}`);
    await this.waitForNetworkIdle();
  }

  async clickNewTestCase(): Promise<void> {
    log.action('click', 'New Test Case button');
    await this.page.locator('[data-testid="nav-new-btn"]').click();
  }

  async fillTestCaseForm(data: TestCaseData): Promise<void> {
    // Use data-testid or #id selectors — labels have no `for` attribute
    log.action('fill', 'title', data.title);
    await this.page.locator('[data-testid="f-title"], #f-title').fill(data.title);

    if (data.description) {
      log.action('fill', 'description', data.description);
      await this.page.locator('[data-testid="f-desc"], #f-desc').fill(data.description);
    }
    if (data.steps) {
      log.action('fill', 'steps');
      await this.page.locator('[data-testid="f-steps"], #f-steps').fill(data.steps);
    }
    if (data.expected) {
      log.action('fill', 'expected result');
      await this.page.locator('[data-testid="f-expected"], #f-expected').fill(data.expected);
    }
    if (data.priority) {
      log.action('select', 'priority', data.priority);
      await this.page.locator('[data-testid="f-priority"], #f-priority').selectOption(data.priority);
    }
    if (data.status) {
      log.action('select', 'status', data.status);
      await this.page.locator('[data-testid="f-status"], #f-status').selectOption(data.status);
    }
  }

  async submitTestCaseForm(): Promise<void> {
    log.action('click', 'Submit test case form');
    await this.page.locator('[data-testid="modal-submit-btn"]').click();
    await this.waitForNetworkIdle();
  }

  getTestCaseRows(): Locator {
    return this.page.locator('[data-testid="testcase-row"], .testcase-row, tbody tr, .test-case-item').filter({ hasText: /./ });
  }

  async clickStartRun(): Promise<void> {
    log.action('click', 'Start Run button');
    await this.page.getByRole('button', { name: /start run|new run|create run/i }).click();
  }

  async fillRunForm(name: string): Promise<void> {
    log.action('fill', 'run name', name);
    // Modal input has id="f-name"; label has no `for` attribute so getByLabel won't work
    await this.page.locator('#f-name').fill(name);
  }

  async submitRunForm(): Promise<void> {
    log.action('click', 'Submit run form');
    await this.page.locator('[data-testid="modal-body"]').getByRole('button', { name: /start run/i }).click();
    await this.waitForNetworkIdle();
  }

  /** Convenience: click Start Run, fill the name, submit, return the new run ID from the URL. */
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
