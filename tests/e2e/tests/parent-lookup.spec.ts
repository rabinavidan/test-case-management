import { test, expect } from '../fixtures/auth.fixture';

// The project, suite, test-case, run-history and run pages used to find a
// suite's project by scanning GET /api/projects (20 newest only) and then
// every project's suites. A project older than the 20 newest was "not
// found", and another user deleting any project mid-scan made the page fail.
// They now fetch the suite and project by id; this pins both properties.

test.describe('Parent lookup — pages find their project and suite by id', () => {
  let tag: string;
  let projectId: number;
  let suiteId: number;
  let runId: number;

  test.beforeEach(async ({ authedRequest, page, authToken }, testInfo) => {
    test.setTimeout(60_000);
    tag = `Lookup_${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;

    const project = await (await authedRequest.post('/api/projects', { data: { name: `${tag} target` } })).json();
    projectId = project.id;
    const suite = await (await authedRequest.post(`/api/projects/${projectId}/suites`, { data: { name: `${tag} suite` } })).json();
    suiteId = suite.id;
    await authedRequest.post(`/api/suites/${suiteId}/testcases`, { data: { title: `${tag} case`, priority: 'medium', status: 'active' } });
    runId = (await (await authedRequest.post(`/api/suites/${suiteId}/runs`, { data: { name: `${tag} run` } })).json()).id;

    // 21 newer projects push the target off GET /api/projects' default page.
    for (let i = 0; i < 21; i++) {
      await authedRequest.post('/api/projects', { data: { name: `${tag} newer ${i}` } });
    }

    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test.afterEach(async ({ authedRequest }) => {
    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    for (const p of items.filter((p: { name: string }) => p.name.startsWith(tag))) {
      await authedRequest.delete(`/api/projects/${p.id}`);
    }
  });

  test('every page under an older project renders, without fetching other projects\' suites', async ({ page }) => {
    const foreignSuiteFetches: string[] = [];
    page.on('request', (req) => {
      const m = new URL(req.url()).pathname.match(/^\/api\/projects\/(\d+)\/suites$/);
      if (m && Number(m[1]) !== projectId) foreignSuiteFetches.push(req.url());
    });
    const breadcrumb = page.getByTestId('breadcrumb');

    await test.step('project page', async () => {
      await page.goto(`/#project/${projectId}`);
      await expect(page.locator('#view-project h1')).toHaveText(`${tag} target`);
    });

    await test.step('suite page', async () => {
      await page.goto(`/#suite/${suiteId}`);
      await expect(breadcrumb).toContainText(`${tag} target`);
      await expect(breadcrumb).toContainText(`${tag} suite`);
      await expect(page.locator('#view-suite')).toContainText(`${tag} case`);
    });

    await test.step('suite test-cases page', async () => {
      await page.goto(`/#suite/${suiteId}/testcases`);
      await expect(breadcrumb).toContainText(`${tag} suite`);
      await expect(page.locator('#main-content')).toContainText(`${tag} case`);
    });

    await test.step('suite run-history page', async () => {
      await page.goto(`/#suite/${suiteId}/runs`);
      await expect(breadcrumb).toContainText('Test Runs');
      await expect(page.getByTestId(`run-card-${runId}`)).toBeVisible();
    });

    await test.step('run page, with its full breadcrumb and Back to Suite', async () => {
      await page.goto(`/#run/${runId}`);
      await expect(page.locator('#view-run h1')).toHaveText(`${tag} run`);
      await expect(breadcrumb).toContainText(`${tag} target`);
      await expect(breadcrumb).toContainText(`${tag} suite`);
      await expect(page.getByRole('button', { name: 'Back to Suite' })).toBeVisible();
    });

    expect(foreignSuiteFetches).toEqual([]);
  });

  test('the sidebar fetches last-run stats only for the projects in view', async ({ page }) => {
    // It used to request every listed project's stats at once (up to 100),
    // queuing the page's own requests behind them in the browser.
    const statsFor = new Set<number>();
    page.on('request', (r) => {
      const m = new URL(r.url()).pathname.match(/^\/api\/projects\/(\d+)\/stats$/);
      if (m) statsFor.add(Number(m[1]));
    });
    await page.goto(`/#project/${projectId}`);
    await expect(page.locator('#view-project h1')).toHaveText(`${tag} target`);
    const list = page.getByTestId('sidebar-projects');
    const rows = await list.locator(':scope > li').count();
    expect(rows).toBeGreaterThanOrEqual(22);
    await page.waitForLoadState('networkidle');
    // The rows in view, plus the 120px pre-load margin below the list.
    const nearView = await list.evaluate((el) => {
      const bottom = el.getBoundingClientRect().bottom + 120;
      return Array.from(el.querySelectorAll('[id^="sidebar-pbar-"]')).filter((b) => b.getBoundingClientRect().top < bottom).length;
    });
    expect(nearView).toBeLessThan(rows);
    // The sidebar renders twice on a project page (on load, then with the
    // active project expanded), each fetching its own rows in view: at most
    // two views' worth, +1 for the page's own stats - not one per project.
    expect(statsFor.size, `stats requested for ${statsFor.size} of ${rows} projects (${nearView} near view)`).toBeLessThanOrEqual(2 * nearView + 1);

    // Scrolling the list loads the rest as they come into view.
    // The last row that isn't this page's own project, whose stats the page
    // itself fetches (it can be the last row when it's the oldest project).
    const barIds = await list.locator('[id^="sidebar-pbar-"]').evaluateAll((bars) =>
      bars.map((b) => Number(b.id.replace('sidebar-pbar-', ''))));
    const lastId = barIds.filter((id) => id !== projectId).at(-1)!;
    expect(statsFor.has(lastId)).toBe(false);
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => statsFor.has(lastId)).toBe(true);
  });

  test('a run page still renders when its parent lookups fail', async ({ page }) => {
    await page.route((url) => url.pathname === `/api/suites/${suiteId}`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }),
    );
    await page.goto(`/#run/${runId}`);
    await expect(page.locator('#view-run h1')).toHaveText(`${tag} run`);
    await expect(page.getByTestId('breadcrumb')).toContainText(`${tag} run`);
    await expect(page.getByRole('button', { name: 'Back to Suite' })).toHaveCount(0);
  });
});
