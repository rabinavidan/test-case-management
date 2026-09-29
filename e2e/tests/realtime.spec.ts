import { test, expect, Browser, Page } from '@playwright/test';
import { gql, readToken, seedRun, deleteProject, UPDATE_RESULT } from '../fixtures/graphql';
import { RunPage } from '../pages/run.page';

/**
 * Real-time features against a real backend: the run-collaboration
 * WebSocket (/ws/runs/{id}, contract in docs/asyncapi.yaml) and the GraphQL
 * `runUpdates` subscription (graphql-transport-ws on /graphql).
 *
 * The socket-level tests open WebSockets from inside the page (the
 * browser's own WebSocket, same as static/app.js) rather than from Node, so
 * they exercise exactly what a user's browser can do — including not being
 * able to set an Authorization header on the handshake.
 */

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const token = readToken();
  await context.addInitScript((t) => localStorage.setItem('tf_token', t), token);
  return context.newPage();
}

/** Opens /ws/runs/{id} in the page and resolves with the first frame, or the close code. */
function socketExchange(page: Page, path: string, send?: string) {
  return page.evaluate(({ path, send }) => new Promise<{ frame?: string; closeCode?: number }>((resolve) => {
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}${path}`);
    ws.onopen = () => { if (send !== undefined) ws.send(send); };
    ws.onmessage = (e) => { resolve({ frame: String(e.data) }); ws.close(); };
    ws.onclose = (e) => resolve({ closeCode: e.code });
  }), { path, send });
}

test.describe('Run WebSocket protocol', () => {
  let seeded: Awaited<ReturnType<typeof seedRun>>;
  test.beforeEach(async ({ request }) => { seeded = await seedRun(request, 'ws-proto', 1); });
  test.afterEach(async ({ request }) => { await deleteProject(request, seeded.projectId); });

  test('JSON ping gets a timestamped pong; legacy text ping still works', async ({ page }) => {
    await page.goto('/');
    const url = `/ws/runs/${seeded.runId}?token=${readToken()}`;
    const json = await socketExchange(page, url, JSON.stringify({ type: 'ping' }));
    expect(JSON.parse(json.frame!)).toMatchObject({ type: 'pong', ts: expect.any(Number) });
    expect((await socketExchange(page, url, 'ping')).frame).toBe('pong');
  });

  test('a malformed frame gets an error message, not a disconnect', async ({ page }) => {
    await page.goto('/');
    const res = await socketExchange(page, `/ws/runs/${seeded.runId}?token=${readToken()}`, '{oops');
    expect(JSON.parse(res.frame!)).toEqual({ type: 'error', detail: expect.stringContaining('JSON') });
  });

  test('closes with 4401 without a valid token and 4404 for an unknown run', async ({ page }) => {
    await page.goto('/');
    expect(await socketExchange(page, `/ws/runs/${seeded.runId}`)).toEqual({ closeCode: 4401 });
    expect(await socketExchange(page, `/ws/runs/${seeded.runId}?token=forged.token.value`)).toEqual({ closeCode: 4401 });
    expect(await socketExchange(page, `/ws/runs/999999999?token=${readToken()}`)).toEqual({ closeCode: 4404 });
  });
});

test.describe('Live run collaboration', () => {
  test('a result recorded in one browser appears in another without a reload', async ({ browser, request }) => {
    const seeded = await seedRun(request, 'live', 2);
    const [alice, bob] = [await signedInPage(browser), await signedInPage(browser)];
    try {
      // Capture Bob's socket so the test can assert on the wire as well as the DOM.
      const bobSocket = bob.waitForEvent('websocket', (ws) => ws.url().includes(`/ws/runs/${seeded.runId}`));
      await new RunPage(bob).goto(Number(seeded.runId));
      await new RunPage(alice).goto(Number(seeded.runId));
      await expect(bob.locator('#ws-indicator')).toBeVisible();

      const ws = await bobSocket;
      expect(ws.url()).toContain('token=');
      const frame = ws.waitForEvent('framereceived', (f) => String(f.payload).includes('result_updated'));

      await new RunPage(alice).markResult(`Case 1 ${seeded.uid}`, 'fail', 'broken in staging');

      const message = JSON.parse(String((await frame).payload));
      expect(message).toMatchObject({ type: 'result_updated', testcase_id: Number(seeded.testCaseIds[0]), status: 'fail' });
      await expect(bob.locator(`[data-tc-id="${seeded.testCaseIds[0]}"] [data-status-badge]`)).toHaveText('Fail');
      // The untouched case is still pending on Bob's screen.
      await expect(bob.locator(`[data-tc-id="${seeded.testCaseIds[1]}"] [data-status-badge]`)).toHaveText('Pending');
    } finally {
      await alice.context().close();
      await bob.context().close();
      await deleteProject(request, seeded.projectId);
    }
  });

  test('a GraphQL mutation also drives the live view', async ({ browser, request }) => {
    const seeded = await seedRun(request, 'live-gql', 1);
    const viewer = await signedInPage(browser);
    try {
      await new RunPage(viewer).goto(Number(seeded.runId));
      await expect(viewer.locator('#ws-indicator')).toBeVisible();

      await gql(request, UPDATE_RESULT, { r: seeded.runId, t: seeded.testCaseIds[0], s: 'SKIP' });

      await expect(viewer.locator(`[data-tc-id="${seeded.testCaseIds[0]}"] [data-status-badge]`)).toHaveText('Skip');
    } finally {
      await viewer.context().close();
      await deleteProject(request, seeded.projectId);
    }
  });
});

test.describe('GraphQL subscription (graphql-transport-ws)', () => {
  test('runUpdates streams result changes to a browser client', async ({ page, request }) => {
    const seeded = await seedRun(request, 'sub', 1);
    try {
      await page.goto('/');
      // Minimal graphql-transport-ws client, in the page: connection_init
      // (token in the payload) -> ack -> subscribe -> first `next`.
      await page.evaluate(({ runId, token }) => {
        const w = window as any;
        w.__ready = false;
        w.__firstEvent = new Promise((resolve, reject) => {
          const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/graphql`, 'graphql-transport-ws');
          ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init', payload: { authToken: token } }));
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'connection_ack') {
              ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: {
                query: 'subscription($r: ID!) { runUpdates(runId: $r) { type testCaseId status updatedBy } }',
                variables: { r: runId },
              } }));
              // The server registers the listener as it processes `subscribe`.
              setTimeout(() => { w.__ready = true; }, 300);
            } else if (msg.type === 'next') {
              resolve(msg.payload);
              ws.send(JSON.stringify({ id: '1', type: 'complete' }));
              ws.close();
            } else if (msg.type === 'error') {
              reject(new Error(JSON.stringify(msg.payload)));
            }
          };
        });
      }, { runId: seeded.runId, token: readToken() });
      await page.waitForFunction(() => (window as any).__ready === true);

      await gql(request, UPDATE_RESULT, { r: seeded.runId, t: seeded.testCaseIds[0], s: 'PASS' });

      const payload = await page.evaluate(() => (window as any).__firstEvent);
      expect(payload).toEqual({ data: { runUpdates: {
        type: 'result_updated', testCaseId: seeded.testCaseIds[0], status: 'pass', updatedBy: expect.any(String),
      } } });
    } finally {
      await deleteProject(request, seeded.projectId);
    }
  });
});
