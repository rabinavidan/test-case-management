import { test, expect } from '../fixtures/auth.fixture';
import { APIRequestContext, Page } from '@playwright/test';

/**
 * The run page's fast path: one-click Pass/Fail/Skip on each row, keyboard
 * shortcuts (J/K to move, P/F/S to record), and the count tiles as filters.
 * Each test seeds its own project, suite, three cases and a run.
 */

type Seeded = { projectId: number; runId: number; caseIds: Record<string, number> };

const TITLES = ['QR login', 'QR checkout', 'QR search'];

async function seedRun(api: APIRequestContext, tag: string): Promise<Seeded> {
  const project = await (await api.post('/api/projects', { data: { name: `QuickRec_${tag}` } })).json();
  const suite = await (await api.post(`/api/projects/${project.id}/suites`, { data: { name: 'Quick record' } })).json();
  const caseIds: Record<string, number> = {};
  for (const title of TITLES) {
    const tc = await (await api.post(`/api/suites/${suite.id}/testcases`, { data: { title, status: 'active', priority: 'medium' } })).json();
    caseIds[title] = tc.id;
  }
  const run = await (await api.post(`/api/suites/${suite.id}/runs`, { data: { name: `QuickRec run ${tag}` } })).json();
  return { projectId: project.id, runId: run.id, caseIds };
}

const row = (page: Page, tcId: number) => page.locator(`#results-list > [data-tc-id="${tcId}"]`);
const badge = (page: Page, tcId: number) => row(page, tcId).locator('[data-status-badge]');
const tileCount = (page: Page, status: string) => page.getByTestId(`run-filter-${status}`).locator('p').first();

test.describe('Run page — quick recording', () => {
  let seeded: Seeded;

  test.beforeEach(async ({ page, authToken, authedRequest }, testInfo) => {
    seeded = await seedRun(authedRequest, `${Date.now()}_${testInfo.workerIndex}`);
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto(`/#run/${seeded.runId}`);
    await expect(row(page, seeded.caseIds['QR login'])).toBeVisible();
  });

  test.afterEach(async ({ authedRequest }) => {
    await authedRequest.delete(`/api/projects/${seeded.projectId}`);
  });

  test('one click records a result and updates the counts without a reload', async ({ page, authedRequest }) => {
    const id = seeded.caseIds['QR checkout'];
    await row(page, id).getByTestId(`mark-fail-${id}`).click();

    await expect(badge(page, id)).toHaveAttribute('data-status-badge', 'fail');
    await expect(row(page, id).getByTestId(`mark-fail-${id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(tileCount(page, 'fail')).toHaveText('1');
    await expect(tileCount(page, 'pending')).toHaveText('2');

    const run = await (await authedRequest.get(`/api/runs/${seeded.runId}`)).json();
    expect(run.results.find((r: { testcase_id: number }) => r.testcase_id === id).status).toBe('fail');
  });

  test('a one-click result keeps the notes recorded earlier', async ({ page, authedRequest }) => {
    const id = seeded.caseIds['QR login'];
    await authedRequest.put(`/api/runs/${seeded.runId}/results/${id}`, { data: { status: 'fail', notes: 'flaky on CI' } });
    await page.reload();

    await row(page, id).getByTestId(`mark-pass-${id}`).click();
    await expect(badge(page, id)).toHaveAttribute('data-status-badge', 'pass');
    await expect(row(page, id)).toContainText('flaky on CI');

    const run = await (await authedRequest.get(`/api/runs/${seeded.runId}`)).json();
    const result = run.results.find((r: { testcase_id: number }) => r.testcase_id === id);
    expect(result.status).toBe('pass');
    expect(result.notes).toBe('flaky on CI');
  });

  test('J moves to a test, P/F/S record it and move to the next one', async ({ page }) => {
    const [a, b, c] = TITLES.map((t) => seeded.caseIds[t]);
    await page.keyboard.press('j');
    await expect(row(page, a)).toBeFocused();

    await page.keyboard.press('p');
    await expect(badge(page, a)).toHaveAttribute('data-status-badge', 'pass');
    await expect(row(page, b)).toBeFocused();

    await page.keyboard.press('f');
    await expect(badge(page, b)).toHaveAttribute('data-status-badge', 'fail');
    await expect(row(page, c)).toBeFocused();

    await page.keyboard.press('k');
    await expect(row(page, b)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('s');
    await expect(badge(page, c)).toHaveAttribute('data-status-badge', 'skip');

    // Every test has a result now, so the run says it is complete.
    await expect(page.locator('#run-status-badge')).toHaveText('Completed');
  });

  test('shortcuts stay out of the way while a dialog is open', async ({ page }) => {
    const id = seeded.caseIds['QR login'];
    await page.keyboard.press('j');
    await row(page, id).getByRole('button', { name: 'Record' }).click();
    await expect(page.getByTestId('modal-box')).toBeVisible();

    await page.keyboard.press('p');
    await expect(badge(page, id)).toHaveAttribute('data-status-badge', 'pending');
  });

  test('a count tile filters the list to that result, and clicking it again shows everything', async ({ page }) => {
    const [a, b, c] = TITLES.map((t) => seeded.caseIds[t]);
    await row(page, b).getByTestId(`mark-fail-${b}`).click();
    await expect(badge(page, b)).toHaveAttribute('data-status-badge', 'fail');

    const failTile = page.getByTestId('run-filter-fail');
    await failTile.click();
    await expect(failTile).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#results-list > [data-tc-id]')).toHaveCount(1);
    await expect(row(page, b)).toBeVisible();
    await expect(page.getByTestId('run-filter-status')).toContainText('Showing 1 fail of 3 results');

    await failTile.click();
    await expect(failTile).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#results-list > [data-tc-id]')).toHaveCount(3);

    await page.getByTestId('run-filter-skip').click();
    await expect(page.getByTestId('run-filter-status')).toContainText('No skip results in this run.');
    await page.getByTestId('run-filter-clear').click();
    await expect(page.locator('#results-list > [data-tc-id]')).toHaveCount(3);
    await expect(row(page, a)).toBeVisible();
    await expect(row(page, c)).toBeVisible();
  });

  test('"Failures first" moves failed tests to the top', async ({ page }) => {
    const last = seeded.caseIds['QR search'];
    await row(page, last).getByTestId(`mark-fail-${last}`).click();
    await expect(badge(page, last)).toHaveAttribute('data-status-badge', 'fail');

    await page.getByTestId('run-failures-first').check();
    await expect(page.locator('#results-list > [data-tc-id]').first()).toHaveAttribute('data-tc-id', String(last));
  });
});
