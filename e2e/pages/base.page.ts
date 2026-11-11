import { Page } from '@playwright/test';
import { log } from '../logger';

/**
 * UI layer root. Page objects own locators and atomic user actions; they
 * make no assertions about business outcomes (that is the spec's job) and
 * hold no domain rules. They do own *waiting* — a spec should never need to
 * know how the SPA signals that a view finished loading.
 */
export class BasePage {
  protected readonly TIMEOUT_SHORT  = 5_000;
  protected readonly TIMEOUT_MEDIUM = 10_000;
  protected readonly TIMEOUT_LONG   = 30_000;

  constructor(protected page: Page) {}

  async navigate(path: string): Promise<void> {
    log.navigate(path);
    await this.page.goto(path);
  }

  /**
   * Waits for one of the SPA's `#view-*` containers to finish rendering.
   * Every render*() in static/app.js unhides its view and paints
   * pageSkeleton() (an `aria-busy` "Loading" block) in the same task, then
   * replaces the skeleton once its data has loaded — so "visible and no
   * skeleton" is a deterministic ready signal, unlike `networkidle`, which
   * waits on unrelated background traffic (polling, websockets, analytics).
   */
  protected async waitForView(viewId: string): Promise<void> {
    const view = this.page.locator(`#${viewId}`);
    await view.waitFor({ state: 'visible', timeout: this.TIMEOUT_LONG });
    await view.locator('[aria-busy="true"][aria-label="Loading"]')
      .waitFor({ state: 'detached', timeout: this.TIMEOUT_LONG });
  }

  /** Waits for the shared modal (#modal-overlay) to close after a submit. */
  protected async waitForModalClosed(): Promise<void> {
    await this.page.locator('#modal-overlay').waitFor({ state: 'hidden', timeout: this.TIMEOUT_MEDIUM });
  }

  /**
   * @deprecated Use a view-specific readiness wait (waitForView). Kept only
   * for pages whose views have no skeleton to wait on (home, contact).
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
