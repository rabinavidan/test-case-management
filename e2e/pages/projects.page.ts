import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectsPage extends BasePage {
  readonly newProjectBtn: Locator;
  readonly nameInput:     Locator;
  readonly descInput:     Locator;
  readonly submitBtn:     Locator;

  constructor(page: Page) {
    super(page);
    this.newProjectBtn = page.getByTestId('nav-new-btn');
    this.nameInput     = page.locator('[data-testid="f-name"], #f-name');
    this.descInput     = page.locator('[data-testid="f-desc"], #f-desc');
    this.submitBtn     = page.getByTestId('modal-submit-btn');
  }

  async goto(): Promise<void> {
    await this.navigate('/');
    await this.waitForNetworkIdle();
  }

  async clickNewProject(): Promise<void> {
    log.action('click', 'New Project button');
    await this.newProjectBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.newProjectBtn.click();
  }

  async fillProjectForm(name: string, desc?: string): Promise<void> {
    log.action('fill', 'project name', name);
    await this.nameInput.waitFor({ state: 'visible', timeout: this.TIMEOUT_MEDIUM });
    await this.nameInput.fill(name);
    if (desc) {
      log.action('fill', 'description', desc);
      await this.descInput.fill(desc);
    }
  }

  async submitProjectForm(): Promise<void> {
    log.action('click', 'Submit project form');
    await this.submitBtn.waitFor({ state: 'visible', timeout: this.TIMEOUT_SHORT });
    await this.submitBtn.click();
    await this.waitForNetworkIdle();
  }

  getProjectCards(): Locator {
    return this.page.locator('[data-testid="project-card"], .project-card, .card').filter({ hasText: /./  });
  }

  async deleteProject(name: string): Promise<void> {
    log.action('delete', `project "${name}"`);
    const row = this.page.locator('[data-testid^="project-row-"]').filter({ hasText: name });
    this.page.once('dialog', d => d.accept());
    await row.locator('[data-testid^="delete-project-"]').click({ force: true });
    await this.waitForNetworkIdle();
  }
}
