import { test, expect } from '../fixtures/auth.fixture';
import { SuitePage } from '../pages/suite.page';
import { RunPage } from '../pages/run.page';

const uid = () => `${Date.now()}`;

test.describe('Sidebar Progress Bar', () => {
  let projectId: number;
  let suiteId: number;

  test.beforeEach(async ({ request, authToken }) => {
    const h = { Authorization: `Bearer ${authToken}` };

    const proj = await request.post('/api/projects', {
      data: { name: `PBar-${uid()}` },
      headers: h,
    });
    projectId = (await proj.json()).id;

    const suite = await request.post(`/api/projects/${projectId}/suites`, {
      data: { name: `Suite-${uid()}` },
      headers: h,
    });
    suiteId = (await suite.json()).id;

    for (const title of ['TC-One', 'TC-Two']) {
      await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title, status: 'active', priority: 'medium' },
        headers: h,
      });
    }
  });

  test.afterEach(async ({ request, authToken }) => {
    await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  test('progress bar appears in sidebar after a run with results', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create and complete a run via the UI
    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`PBarRun-${uid()}`);

    const runPage = new RunPage(page);
    await runPage.goto(runId);
    await runPage.markResult('TC-One', 'pass');
    await runPage.markResult('TC-Two', 'fail');

    // Navigate back to home to reload sidebar
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bar = page.locator(`#sidebar-pbar-${projectId}`);
    await bar.waitFor({ state: 'visible', timeout: 8000 });

    // At least one colored segment must be present (pass = emerald, fail = red)
    const passSegment = bar.locator('div.bg-emerald-500');
    const failSegment = bar.locator('div.bg-red-500');
    await expect(passSegment.or(failSegment)).toHaveCount(2);

    // Pass-rate label is present and non-empty
    const label = bar.locator('span');
    await expect(label).toBeVisible();
    await expect(label).not.toBeEmpty();
  });

  test('progress bar shows no bar when project has no runs', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bar = page.locator(`#sidebar-pbar-${projectId}`);
    // Container exists but should be empty (no run data)
    await bar.waitFor({ state: 'attached', timeout: 8000 });
    await expect(bar).toBeEmpty();
  });

  test('progress bar reflects all-pass run with 100% label', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`AllPass-${uid()}`);

    const runPage = new RunPage(page);
    await runPage.goto(runId);
    await runPage.markResult('TC-One', 'pass');
    await runPage.markResult('TC-Two', 'pass');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bar = page.locator(`#sidebar-pbar-${projectId}`);
    await bar.waitFor({ state: 'visible', timeout: 8000 });

    // Only pass (emerald) segments — no red or amber
    await expect(bar.locator('div.bg-red-500')).toHaveCount(0);
    await expect(bar.locator('div.bg-amber-400')).toHaveCount(0);

    // Label reads 100%
    const label = bar.locator('span');
    await expect(label).toHaveText('100%');
  });
});
