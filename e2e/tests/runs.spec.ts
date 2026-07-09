import { test, expect } from '../fixtures/auth.fixture';
import { SuitePage } from '../pages/suite.page';
import { RunPage } from '../pages/run.page';

const uid = () => `${Date.now()}`;

test.describe('Test Runs', () => {
  let projectId: number;
  let suiteId: number;

  test.beforeEach(async ({ page, request, authToken }) => {
    const h = { Authorization: `Bearer ${authToken}` };

    const proj = await request.post('/api/projects', { data: { name: `RunProj-${uid()}` }, headers: h });
    projectId = (await proj.json()).id;

    const suite = await request.post(`/api/projects/${projectId}/suites`, { data: { name: `RunSuite-${uid()}` }, headers: h });
    suiteId = (await suite.json()).id;

    for (const title of ['TC-Alpha', 'TC-Beta']) {
      await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title, status: 'active', priority: 'medium' }, headers: h,
      });
    }

    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ request, authToken }) => {
    await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  test('can start a test run from a suite', async ({ page }) => {
    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`Run-${uid()}`);
    expect(runId).toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`run/${runId}`));
  });

  test('can mark test cases as pass and fail', async ({ page }) => {
    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`Run-${uid()}`);

    const runPage = new RunPage(page);
    await runPage.goto(runId);
    await runPage.markResult('TC-Alpha', 'pass');
    await runPage.markResult('TC-Beta', 'fail');

    const summary = await runPage.getSummary();
    expect(summary.pass).toBeGreaterThanOrEqual(1);
    expect(summary.fail).toBeGreaterThanOrEqual(1);
  });

  test('run summary shows correct counts after all results', async ({ page }) => {
    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`Run-${uid()}`);

    const runPage = new RunPage(page);
    await runPage.goto(runId);
    await runPage.markResult('TC-Alpha', 'pass', 'All good');
    await runPage.markResult('TC-Beta', 'skip', 'N/A');

    const summary = await runPage.getSummary();
    expect(summary.pass).toBeGreaterThanOrEqual(1);
    expect(summary.skip).toBeGreaterThanOrEqual(1);
    expect(summary.pending).toBe(0);
  });

  test('all-pass run has no failures or pending', async ({ page }) => {
    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`Run-${uid()}`);

    const runPage = new RunPage(page);
    await runPage.goto(runId);
    await runPage.markResult('TC-Alpha', 'pass');
    await runPage.markResult('TC-Beta', 'pass');

    const summary = await runPage.getSummary();
    expect(summary.fail).toBe(0);
    expect(summary.pending).toBe(0);
  });
});
