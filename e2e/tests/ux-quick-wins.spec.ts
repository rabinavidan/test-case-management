import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { test as guestTest, expect as guestExpect } from '@playwright/test';

/**
 * Layout and accessibility fixes from the UX review: guests get the full
 * width, the hero leads with the Recruiter Tour, each page has one "New"
 * button, the signed-in walkthrough waits behind the showcase toggle, and
 * list controls have accessible names.
 */

guestTest.describe('Guest home', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('has no sidebar, so the showcase gets the full width', async ({ page }) => {
    await guestExpect(page.getByTestId('app-sidebar')).toBeHidden();
  });

  guestTest('the hero\'s Tour button starts the tour and gets focus back when it closes', async ({ page }) => {
    const tourBtn = page.getByTestId('hero-tour-btn');
    await tourBtn.click();
    await guestExpect(page.getByTestId('recruiter-tour-card')).toBeVisible();

    await page.keyboard.press('Escape');
    await guestExpect(page.getByTestId('recruiter-tour-card')).toHaveCount(0);
    await guestExpect(tourBtn).toBeFocused();
  });
});

authTest.describe('Signed-in pages', () => {
  let projectId: number;
  let suiteId: number;
  const name = `UXWin_${Date.now()}`;

  authTest.beforeEach(async ({ page, authToken, authedRequest }) => {
    projectId = (await (await authedRequest.post('/api/projects', { data: { name } })).json()).id;
    suiteId = (await (await authedRequest.post(`/api/projects/${projectId}/suites`, { data: { name: `${name} suite` } })).json()).id;
    await authedRequest.post(`/api/suites/${suiteId}/testcases`, { data: { title: `${name} case`, status: 'active', priority: 'low' } });
    await page.addInitScript((t) => {
      localStorage.setItem('tf_token', t);
      localStorage.removeItem('tf_showcase_expanded');
    }, authToken);
  });

  authTest.afterEach(async ({ authedRequest }) => {
    await authedRequest.delete(`/api/projects/${projectId}`);
  });

  authTest('the sidebar is back once signed in', async ({ page }) => {
    await page.goto('/#projects');
    await authExpect(page.getByTestId('app-sidebar')).toBeVisible();
  });

  authTest('each page has a single New button, beside its heading', async ({ page }) => {
    await page.goto('/#projects');
    await authExpect(page.getByTestId('new-project-btn')).toBeVisible();
    await authExpect(page.locator('#view-projects').getByRole('button', { name: 'New Project' })).toHaveCount(1);

    await page.goto(`/#project/${projectId}`);
    await authExpect(page.getByTestId('new-suite-btn')).toBeVisible();
    await authExpect(page.locator('#view-project').getByRole('button', { name: 'New Suite' })).toHaveCount(1);

    await page.goto(`/#suite/${suiteId}`);
    await authExpect(page.getByTestId('new-testcase-btn')).toBeVisible();
    await authExpect(page.locator('#view-suite').getByRole('button', { name: 'New Test Case' })).toHaveCount(1);
  });

  authTest('the product walkthrough waits behind the showcase toggle', async ({ page }) => {
    await page.goto('/#projects');
    const walkthrough = page.locator('#view-projects').getByText('How TestFlow works');
    await authExpect(walkthrough).toBeHidden();

    await page.locator('#showcase-toggle-btn').click();
    await authExpect(walkthrough).toBeVisible();
  });

  authTest('list checkboxes, the sort menu and icon buttons have accessible names', async ({ page }) => {
    await page.goto('/#projects');
    await authExpect(page.getByRole('checkbox', { name: `Select project ${name}` })).toBeVisible();
    await authExpect(page.getByRole('checkbox', { name: 'Select all projects' })).toBeVisible();
    await authExpect(page.getByRole('combobox', { name: 'Sort projects' })).toBeVisible();

    await page.goto(`/#project/${projectId}`);
    await authExpect(page.getByRole('checkbox', { name: `Select suite ${name} suite` })).toHaveCount(1);
    await authExpect(page.getByRole('button', { name: `Delete suite ${name} suite` })).toHaveCount(1);

    await page.goto(`/#suite/${suiteId}`);
    await authExpect(page.getByRole('checkbox', { name: `Select test case ${name} case` })).toBeVisible();
  });
});
