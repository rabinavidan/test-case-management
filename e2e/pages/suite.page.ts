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
    await this.page.getByRole('button', { name: /new test case|add test case|create test case/i }).click();
  }

  async fillTestCaseForm(data: TestCaseData): Promise<void> {
    await this.page.getByLabel(/title|test case name|name/i).fill(data.title);

    if (data.description) {
      await this.page.getByLabel(/description/i).fill(data.description);
    }
    if (data.steps) {
      await this.page.getByLabel(/steps/i).fill(data.steps);
    }
    if (data.expected) {
      await this.page.getByLabel(/expected/i).fill(data.expected);
    }
    if (data.priority) {
      const prioritySelect = this.page.getByLabel(/priority/i);
      await prioritySelect.selectOption(data.priority);
    }
    if (data.status) {
      const statusSelect = this.page.getByLabel(/status/i);
      await statusSelect.selectOption(data.status);
    }
  }

  async submitTestCaseForm(): Promise<void> {
    log.action('click', 'Submit test case form');
    await this.page.getByRole('button', { name: /create|save|submit/i }).click();
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
    await this.page.getByLabel(/run name|name/i).fill(name);
  }

  async submitRunForm(): Promise<void> {
    await this.page.getByRole('button', { name: /start|create|submit/i }).click();
    await this.waitForNetworkIdle();
  }

  /** Convenience: click Start Run, fill the name, submit, and return the new run ID from the URL. */
  async startRun(name: string): Promise<number> {
    await this.clickStartRun();
    await this.fillRunForm(name);
    await this.submitRunForm();
    const url = this.page.url();
    const match = url.match(/run\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
