import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectPage extends BasePage {
  readonly view:           Locator;
  readonly newSuiteBtn:    Locator;
  readonly nameInput:      Locator;
  readonly descInput:      Locator;
  readonly submitBtn:      Locator;

  constructor(page: Page) {
    super(page);
    this.view           = page.locator('#view-project');
    this.newSuiteBtn    = page.getByTestId('new-suite-btn');
    this.nameInput      = page.locator('#f-name');
    this.descInput      = page.locator('#f-desc');
    this.submitBtn      = page.getByTestId('modal-submit-btn');
  }

  async goto(id: number): Promise<void> {
    await this.navigate(`/#project/${id}`);
    await this.waitForView('view-project');
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
    await this.waitForModalClosed();
  }

  /** The number on one of the project's stat tiles. */
  stat(name: 'suites' | 'cases' | 'runs' | 'pass-rate'): Locator {
    return this.page.getByTestId(`project-stat-${name}`);
  }

  getSuiteCards(): Locator {
    return this.page.locator('[data-testid^="suite-card-"]').filter({ hasText: /./ });
  }

  /** Scoped to the suite cards, so a breadcrumb/sidebar mention never matches. */
  suiteCard(name: string): Locator {
    return this.getSuiteCards().filter({ hasText: name });
  }

  async deleteSuite(suiteId: number): Promise<void> {
    log.action('delete', `suite ${suiteId}`);
    this.page.once('dialog', d => d.accept());
    await this.page.getByTestId(`delete-suite-${suiteId}`).click();
  }
}
