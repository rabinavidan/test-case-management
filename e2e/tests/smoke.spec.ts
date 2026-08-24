import { test, expect } from '../fixtures/auth.fixture';

const uid = () => `${Date.now()}`;

/**
 * Critical-path smoke suite.
 *
 * The core Project -> Suite -> Test Cases -> Run flow must work on every deploy.
 * This is a thin, fast happy-path (API-driven, plus a UI shell check) meant to
 * gate merges and post-deploy validation without running the full regression.
 *
 * Run with:  npm run test:smoke   (== playwright test --grep @smoke)
 *
 * Every test here is tagged @smoke and the describe title carries @smoke too,
 * so both `--grep @smoke` and tag-based filtering select this suite.
 */
test.describe('Smoke @smoke', () => {
  let projectId: number | undefined;

  test.afterEach(async ({ request, authToken }) => {
    if (projectId) {
      await request
        .delete(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${authToken}` } })
        .catch(() => {});
      projectId = undefined;
    }
  });

  test('critical path: project -> suite -> test cases -> run', { tag: '@smoke' }, async ({ request, authToken }) => {
    const h = { Authorization: `Bearer ${authToken}` };

    await test.step('Create project', async () => {
      const res = await request.post('/api/projects', {
        data: { name: `Smoke-${uid()}`, description: 'critical-path smoke' },
        headers: h,
      });
      expect(res.ok()).toBeTruthy();
      projectId = (await res.json()).id;
      expect(projectId).toBeGreaterThan(0);
    });

    let suiteId: number;
    await test.step('Create suite', async () => {
      const res = await request.post(`/api/projects/${projectId}/suites`, {
        data: { name: `SmokeSuite-${uid()}` },
        headers: h,
      });
      expect(res.ok()).toBeTruthy();
      suiteId = (await res.json()).id;
      expect(suiteId).toBeGreaterThan(0);
    });

    await test.step('Create test cases and read them back', async () => {
      for (const title of ['Smoke-TC-1', 'Smoke-TC-2']) {
        const res = await request.post(`/api/suites/${suiteId}/testcases`, {
          data: { title, status: 'active', priority: 'medium' },
          headers: h,
        });
        expect(res.ok()).toBeTruthy();
      }
      const list = await request.get(`/api/suites/${suiteId}/testcases`, { headers: h });
      expect(list.ok()).toBeTruthy();
      const body = await list.json();
      const items = Array.isArray(body) ? body : (body.items ?? []);
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    let runId: number;
    await test.step('Start a run', async () => {
      const res = await request.post(`/api/suites/${suiteId}/runs`, {
        data: { name: `SmokeRun-${uid()}` },
        headers: h,
      });
      expect(res.ok()).toBeTruthy();
      runId = (await res.json()).id;
      expect(runId).toBeGreaterThan(0);
    });

    await test.step('Run is retrievable', async () => {
      const res = await request.get(`/api/runs/${runId}`, { headers: h });
      expect(res.ok()).toBeTruthy();
    });
  });

  test('app shell loads for an authenticated user', { tag: '@smoke' }, async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveTitle(/error|404|500/i);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });
});
