import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Regression test for a production incident: the shared api() helper
// (static/app.js) used a plain fetch() with no timeout. Any render path that
// shows a spinner before awaiting a fetch - most critically renderProject(),
// which a fresh guest lands on directly via the flagship-demo redirect - had
// no way to recover if a backend call hung instead of erroring: the spinner
// placeholder just stayed up forever with nothing else on screen. api() now
// aborts and rejects with a human-readable message after API_TIMEOUT_MS, so
// every caller's existing catch block actually gets a chance to run.
authTest.describe('A hung backend request never leaves the app stuck on an infinite spinner', () => {
  let projectId: number;

  authTest.beforeEach(async ({ authedRequest }) => {
    const res = await authedRequest.post('/api/projects', { data: { name: 'API Timeout Regression Project' } });
    authExpect(res.ok()).toBeTruthy();
    projectId = (await res.json()).id;
  });

  authTest.afterEach(async ({ authedRequest }) => {
    await authedRequest.delete(`/api/projects/${projectId}`).catch(() => {});
  });

  authTest('a hung /suites request surfaces a human-readable error instead of hanging forever', async ({ page }) => {
    authTest.setTimeout(45000);
    // Never call route.fulfill/continue/abort - the request stays pending
    // forever, simulating a hung (not merely slow or erroring) backend call.
    await page.route('**/api/projects/*/suites', () => new Promise(() => {}));

    await page.goto(`/#project/${projectId}`);

    const errorState = page.locator('#view-project').getByText(/took too long to respond/i);
    await authExpect(errorState).toBeVisible({ timeout: 25000 });
  });
});
