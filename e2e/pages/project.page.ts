import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#project/${id}`);
    await this.waitForNetworkIdle();
  }

  async clickNewSuite(): Promise<void> {
    log.action('click', 'New Suite button');
    await this.page.getByRole('button', { name: /new suite|add suite|create suite/i }).click();
  }

  async fillSuiteForm(name: string, desc?: string): Promise<void> {
    log.action('fill', 'suite name', name);
    await this.page.getByLabel(/suite name|name/i).fill(name);
    if (desc) {
      log.action('fill', 'description', desc);
      await this.page.getByLabel(/description/i).fill(desc);
    }
  }

  async submitSuiteForm(): Promise<void> {
    log.action('click', 'Submit suite form');
    await this.page.getByRole('button', { name: /create|save|submit/i }).click();
    await this.waitForNetworkIdle();
  }

  getSuiteCards(): Locator {
    return this.page.locator('[data-testid="suite-card"], .suite-card, .card').filter({ hasText: /./ });
  }

  async getStats(): Promise<{ suites: number; cases: number; runs: number }> {
    const statsContainer = this.page.locator('[data-testid="project-stats"], .stats, .project-stats');
    const text = await statsContainer.textContent() || '';

    const suites = parseInt(text.match(/(\d+)\s*suite/i)?.[1] || '0', 10);
    const cases = parseInt(text.match(/(\d+)\s*(test\s*)?case/i)?.[1] || '0', 10);
    const runs = parseInt(text.match(/(\d+)\s*run/i)?.[1] || '0', 10);

    return { suites, cases, runs };
  }
}
