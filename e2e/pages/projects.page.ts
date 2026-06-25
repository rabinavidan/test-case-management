import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class ProjectsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.navigate('/');
    await this.waitForNetworkIdle();
  }

  async clickNewProject(): Promise<void> {
    await this.page.getByRole('button', { name: /new project|add project|create project/i }).click();
  }

  async fillProjectForm(name: string, desc?: string): Promise<void> {
    await this.page.getByLabel(/project name|name/i).fill(name);
    if (desc) {
      await this.page.getByLabel(/description/i).fill(desc);
    }
  }

  async submitProjectForm(): Promise<void> {
    await this.page.getByRole('button', { name: /create|save|submit/i }).click();
    await this.waitForNetworkIdle();
  }

  getProjectCards(): Locator {
    return this.page.locator('[data-testid="project-card"], .project-card, .card').filter({ hasText: /./  });
  }

  async deleteProject(name: string): Promise<void> {
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
