import { test, expect, Page, WebSocketRoute } from '@playwright/test';
import { mockProject, mockProjectList, mockRun, mockSuite, mockTestCase, mockTestResult } from '../mocks/factories';
import { fulfillJson, mockAuthSession, byPath } from '../mocks/route-helpers';

/**
 * The run page's live-update client (static/app.js connectRunWebSocket)
 * against a *mocked* WebSocket — page.routeWebSocket() plays the server, so
 * these cover what the real backend can't easily produce on demand: an
 * arbitrary pushed event, a malformed frame, an auth-rejection close. The
 * real-backend counterpart is realtime.spec.ts. Message shapes follow
 * docs/asyncapi.yaml.
 */

async function openMockedRun(page: Page) {
  await mockAuthSession(page);
  const project = mockProject({ name: 'Realtime Project' });
  const suite = mockSuite({ project_id: project.id, name: 'Realtime Suite' });
  const cases = [mockTestCase({ suite_id: suite.id, title: 'Login works' }), mockTestCase({ suite_id: suite.id, title: 'Logout works' })];
  const run = mockRun({ suite_id: suite.id, name: 'Live Run' });
  run.results = cases.map((tc) => mockTestResult({ run_id: run.id, test_case: tc }));

  await page.route(byPath(`/api/runs/${run.id}`), (route) => fulfillJson(route, 200, run));
  await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
  await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));

  let resolveSocket: (ws: WebSocketRoute) => void;
  const socket = new Promise<WebSocketRoute>((r) => { resolveSocket = r; });
  await page.routeWebSocket(new RegExp(`/ws/runs/${run.id}(\\?|$)`), (ws) => {
    // No connectToServer(): the handler *is* the server.
    ws.onMessage((message) => { if (message === 'ping') ws.send('pong'); });
    resolveSocket(ws);
  });

  await page.goto(`/#run/${run.id}`);
  return { run, cases, socket: await socket };
}

const badge = (page: Page, testCaseId: number) => page.locator(`[data-tc-id="${testCaseId}"] [data-status-badge]`);

test.describe('Run page live updates — mocked WebSocket', () => {
  test('connects with the session token and shows the Live indicator', async ({ page }) => {
    const { socket } = await openMockedRun(page);
    expect(new URL(socket.url()).searchParams.get('token')).toBeTruthy();
    await expect(page.locator('#ws-indicator')).toBeVisible();
  });

  test('a pushed result_updated event updates the row and announces who changed it', async ({ page }) => {
    const { cases, socket } = await openMockedRun(page);
    await expect(badge(page, cases[0].id)).toHaveText('Pending');

    socket.send(JSON.stringify({
      type: 'result_updated', testcase_id: cases[0].id, status: 'fail',
      notes: 'timeout on submit', updated_by: 'dana', run_completed: false,
    }));

    await expect(badge(page, cases[0].id)).toHaveText('Fail');
    await expect(badge(page, cases[0].id)).toHaveAttribute('data-status-badge', 'fail');
    await expect(badge(page, cases[1].id)).toHaveText('Pending');
    await expect(page.locator('#toast-inner')).toContainText('dana marked a test as fail');
  });

  test('run_completed shows a completion toast', async ({ page }) => {
    const { cases, socket } = await openMockedRun(page);
    socket.send(JSON.stringify({
      type: 'result_updated', testcase_id: cases[1].id, status: 'pass',
      notes: null, updated_by: 'lee', run_completed: true,
    }));
    await expect(page.locator('#toast-inner')).toContainText('Run completed by lee');
  });

  test('pong, error and malformed frames are ignored without breaking later updates', async ({ page }) => {
    const { cases, socket } = await openMockedRun(page);
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    socket.send('pong');
    socket.send(JSON.stringify({ type: 'pong', ts: 1 }));
    socket.send(JSON.stringify({ type: 'error', detail: 'Malformed message: expected JSON' }));
    socket.send('{not json');
    socket.send(JSON.stringify({ type: 'result_updated', testcase_id: 424242, status: 'pass' })); // unknown row
    socket.send(JSON.stringify({ type: 'result_updated', testcase_id: cases[0].id, status: 'skip', updated_by: 'kim' }));

    await expect(badge(page, cases[0].id)).toHaveText('Skip');
    expect(pageErrors).toEqual([]);
  });

  test('a 4401 close hides the Live indicator and logs why; the page keeps working', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    const { cases, socket } = await openMockedRun(page);
    await expect(page.locator('#ws-indicator')).toBeVisible();

    await socket.close({ code: 4401, reason: 'Not authenticated' });

    await expect(page.locator('#ws-indicator')).toBeHidden();
    await expect.poll(() => warnings.join('\n')).toContain('close 4401: Not authenticated');
    await expect(badge(page, cases[0].id)).toHaveText('Pending');
  });

  test('the client keeps the socket alive with a ping the server answers', async ({ page }) => {
    await page.clock.install();
    const { socket } = await openMockedRun(page);
    const ping = new Promise<string | Buffer>((resolve) => socket.onMessage((m) => {
      if (m === 'ping') socket.send('pong');
      resolve(m);
    }));
    await page.clock.runFor(25_000);
    expect(await ping).toBe('ping');
  });
});
