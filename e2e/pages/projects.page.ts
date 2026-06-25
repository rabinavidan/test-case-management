import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.navigate('/');
    await this.waitForNetworkIdle();
  }

  async clickNewProject(): Promise<void> {
    log.action('click', 'New Project button');
    await this.page.getByRole('button', { name: /new project|add project|create project/i }).click();
  }

  async fillProjectForm(name: string, desc?: string): Promise<void> {
    log.action('fill', 'project name', name);
    await this.page.locator('[data-testid="f-name"], #f-name').fill(name);
    if (desc) {
      log.action('fill', 'description', desc);
      await this.page.locator('[data-testid="f-desc"], #f-desc').fill(desc);
    }
  }

  async submitProjectForm(): Promise<void> {
    log.action('click', 'Submit project form');
    await this.page.locator('[data-testid="modal-submit-btn"]').click();
    await this.waitForNetworkIdle();
  }

  getProjectCards(): Locator {
    return this.page.locator('[data-testid="project-card"], .project-card, .card').filter({ hasText: /./  });
  }

  async deleteProject(name: string): Promise<void> {
    log.action('delete', `project "${name}"`);
    const card = this.page.locator('[data-testid="project-card"], .project-card, .card').filter({ hasText: name });
    await card.getByRole('button', { name: /delete/i }).click();
    // Confirm dialog if present
    const confirmBtn = this.page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await this.waitForNetworkIdle();
  }
}
