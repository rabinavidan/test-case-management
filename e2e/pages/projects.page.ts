import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { log } from '../logger';

export class ProjectsPage extends BasePage {
  readonly newProjectBtn: Locator;
  readonly nameInput:     Locator;
  readonly descInput:     Locator;
  readonly submitBtn:     Locator;
  readonly searchInput:   Locator;
  readonly nextPageBtn:   Locator;
  readonly prevPageBtn:   Locator;
  /** Rendered instead of the list when the signed-in user has no projects. */
  readonly emptyState:    Locator;

  constructor(page: Page) {
    super(page);
    this.newProjectBtn = page.getByTestId('new-project-btn');
    this.nameInput     = page.locator('#f-name');
    this.descInput     = page.locator('#f-desc');
    this.submitBtn     = page.getByTestId('modal-submit-btn');
    this.searchInput   = page.locator('#proj-search');
    this.nextPageBtn   = page.getByTestId('proj-next-btn');
    this.prevPageBtn   = page.getByTestId('proj-prev-btn');
    this.emptyState    = page.getByTestId('empty-state');
  }

  async goto(): Promise<void> {
    await this.navigate('/');
    await this.waitForView('view-projects');
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
    await this.waitForModalClosed();
  }

  /** Client-side filter; resets the table to page 1. */
  async search(text: string): Promise<void> {
    log.action('fill', 'project search', text);
    await this.searchInput.fill(text);
  }

  async nextPage(): Promise<void> {
    log.action('click', 'Next page');
    await this.nextPageBtn.click();
  }

  async previousPage(): Promise<void> {
    log.action('click', 'Previous page');
    await this.prevPageBtn.click();
  }

  /** Table rows only — the sidebar lists every project too, unpaginated. */
  getProjectCards(): Locator {
    return this.page.locator('[data-testid^="project-row-"]').filter({ hasText: /./ });
  }

  projectRow(name: string): Locator {
    return this.getProjectCards().filter({ hasText: name });
  }

  async deleteProject(name: string): Promise<void> {
    log.action('delete', `project "${name}"`);
    this.page.once('dialog', d => d.accept());
    await this.projectRow(name).locator('[data-testid^="delete-project-"]').click({ force: true });
  }
}
