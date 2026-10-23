import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { test as guestTest, expect as guestExpect } from '@playwright/test';

/**
 * The modern UI layer: the Ctrl/Cmd+K command palette, test case search and
 * status filters, the KPI section's measured vs roadmap rows, the header's
 * scrolled state and the phone breadcrumb.
 */

guestTest.describe('Command palette — guest', () => {
  guestTest('"/" opens it, it lists guest actions, and Escape closes it and returns focus', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    const opener = page.getByTestId('cmdk-btn');
    await opener.focus();

    await page.keyboard.press('/');
    const input = page.getByTestId('cmdk-input');
    await guestExpect(input).toBeFocused();
    await input.fill('tour');
    await guestExpect(page.getByTestId('cmdk-option').first()).toContainText('Recruiter Tour');

    await page.keyboard.press('Escape');
    await guestExpect(page.getByTestId('cmdk')).toHaveCount(0);
    await guestExpect(opener).toBeFocused();
  });

  guestTest('the header gains its scrolled style once the page scrolls', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    const header = page.locator('#app-header');
    guestExpect(await header.evaluate((e) => e.classList.contains('is-scrolled'))).toBe(false);
    await page.mouse.wheel(0, 800);
    await guestExpect(header).toHaveClass(/is-scrolled/);
  });

  guestTest('measured KPIs lead; the unmeasured ones sit in the roadmap row', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await guestExpect(page.getByTestId('kpi-measured-grid').getByTestId('kpi-card-code-coverage')).toHaveCount(1);
    for (const id of ['kpi-card-flaky-test-rate', 'kpi-card-ai-call-cost', 'kpi-card-release-readiness']) {
      await guestExpect(page.getByTestId('kpi-roadmap-grid').getByTestId(id)).toHaveCount(1);
    }
  });
});

authTest.describe('Signed-in pages', () => {
  let projectId: number;
  let suiteId: number;
  const tag = `UXModern_${Date.now()}`;

  authTest.beforeEach(async ({ page, authToken, authedRequest }) => {
    projectId = (await (await authedRequest.post('/api/projects', { data: { name: `${tag} project` } })).json()).id;
    suiteId = (await (await authedRequest.post(`/api/projects/${projectId}/suites`, { data: { name: `${tag} suite` } })).json()).id;
    for (const [title, status, description] of [
      ['Login works', 'active', 'valid credentials'],
      ['Checkout total', 'draft', 'tax and shipping'],
      ['Legacy export', 'deprecated', 'old CSV format'],
    ]) {
      await authedRequest.post(`/api/suites/${suiteId}/testcases`, { data: { title, status, priority: 'medium', description } });
    }
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  authTest.afterEach(async ({ authedRequest }) => {
    await authedRequest.delete(`/api/projects/${projectId}`);
  });

  authTest('Ctrl+K finds a suite by name and Enter opens it', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Control+k');
    await page.getByTestId('cmdk-input').fill(`${tag} suite`);
    await authExpect(page.getByTestId('cmdk-option').first()).toContainText(`${tag} suite`);
    await page.keyboard.press('Enter');
    await authExpect(page).toHaveURL(new RegExp(`#suite/${suiteId}$`));
    await authExpect(page.getByTestId('cmdk')).toHaveCount(0);
  });

  authTest('test cases narrow by search text and by status chip', async ({ page }) => {
    await page.goto(`/#suite/${suiteId}`);
    const cards = page.locator('#view-suite [data-testid^="testcase-card-"]:visible');
    await authExpect(cards).toHaveCount(3);

    await page.getByTestId('tc-search').fill('tax');
    await authExpect(cards).toHaveCount(1);
    await authExpect(cards.first()).toContainText('Checkout total');

    await page.getByTestId('tc-search').fill('');
    await page.getByTestId('tc-filter-deprecated').click();
    await authExpect(page.getByTestId('tc-filter-deprecated')).toHaveAttribute('aria-pressed', 'true');
    await authExpect(cards).toHaveCount(1);
    await authExpect(cards.first()).toContainText('Legacy export');

    await page.getByTestId('tc-search').fill('login');
    await authExpect(cards).toHaveCount(0);
    await authExpect(page.getByTestId('tc-filter-empty')).toBeVisible();
    await page.getByTestId('tc-filter-empty').getByRole('button', { name: 'Clear filters' }).click();
    await authExpect(cards).toHaveCount(3);
  });

  authTest('on a phone the breadcrumb shows the parent and the current page on its own row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#suite/${suiteId}/testcases`);
    const crumbs = page.getByTestId('breadcrumb');
    await authExpect(crumbs.getByRole('button', { name: `${tag} suite` })).toBeVisible();
    await authExpect(crumbs.locator('[aria-current="page"]')).toHaveText('Test Cases');
    await authExpect(crumbs.getByRole('button', { name: 'Projects' })).toBeHidden();
  });
});
