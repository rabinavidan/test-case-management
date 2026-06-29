import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectPage extends BasePage {
  readonly newSuiteBtn:    Locator;
  readonly nameInput:      Locator;
  readonly descInput:      Locator;
  readonly submitBtn:      Locator;
  readonly statsContainer: Locator;

  constructor(page: Page) {
    super(page);
    this.newSuiteBtn    = page.getByTestId('nav-new-btn');
    this.nameInput      = page.locator('[data-testid="f-name"], #f-name');
    this.descInput      = page.locator('[data-testid="f-desc"], #f-desc');
    this.submitBtn      = page.getByTestId('modal-submit-btn');
    this.statsContainer = page.locator('[data-testid="project-stats"], .stats, .project-stats');
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#project/${id}`);
    await this.waitForNetworkIdle();
  }

  async clickNewSuite(): Promise<void> {
    log.action('click', 'New Suite button');
    await this.newSuiteBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.newSuiteBtn.click();
  }

  async fillSuiteForm(name: string, desc?: string): Promise<void> {
    log.action('fill', 'suite name', name);
    await this.nameInput.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.nameInput.fill(name);
    if (desc) {
      log.action('fill', 'description', desc);
      await this.descInput.fill(desc);
    }
  }

  async submitSuiteForm(): Promise<void> {
    log.action('click', 'Submit suite form');
    await this.submitBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_SHORT });
    await this.submitBtn.click();
    await this.waitForNetworkIdle();
  }

  getSuiteCards(): Locator {
    return this.page.locator('[data-testid^="suite-card-"]').filter({ hasText: /./ });
  }

  async getStats(): Promise<{ suites: number; cases: number; runs: number }> {
    const text = await this.statsContainer.textContent() || '';
    const suites = parseInt(text.match(/(\d+)\s*suite/i)?.[1] || '0', 10);
    const cases  = parseInt(text.match(/(\d+)\s*(test\s*)?case/i)?.[1] || '0', 10);
    const runs   = parseInt(text.match(/(\d+)\s*run/i)?.[1] || '0', 10);
    return { suites, cases, runs };
  }
}
