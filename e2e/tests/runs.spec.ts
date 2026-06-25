import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { SuitePage } from '../pages/suite.page';
import { RunPage } from '../pages/run.page';

function getToken(): string {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'auth-state.json'), 'utf-8')).token;
}
const uid = () => `${Date.now()}`;

test.describe('Test Runs', () => {
  let token: string;
  let projectId: number;
  let suiteId: number;

  test.beforeEach(async ({ request }) => {
    token = getToken();
    const h = { Authorization: `Bearer ${token}` };

    const proj = await request.post('/api/projects', { data: { name: `RunProj-${uid()}` }, headers: h });
    projectId = (await proj.json()).id;

    const suite = await request.post(`/api/projects/${projectId}/suites`, { data: { name: `RunSuite-${uid()}` }, headers: h });
    suiteId = (await suite.json()).id;

    for (const title of ['TC-Alpha', 'TC-Beta']) {
      await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title, status: 'active', priority: 'medium' }, headers: h,
      });
    }
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('can start a test run from a suite', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('token', t), token);

    const suitePage = new SuitePage(page);
    await suitePage.goto(suiteId);
    const runId = await suitePage.startRun(`Run-${uid()}`);
    expect(runId).toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`run/${runId}`));
  });

  test('can mark test cases as pass and fail', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('token', t), token);

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
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('token', t), token);

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
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('token', t), token);

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
