import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// E2E coverage for backend failure shapes that are hard to trigger against a
// real backend on demand: explicit HTTP errors, a dropped connection, a
// malformed response body, and a partial failure inside a parallel fetch.
// Network calls are intercepted with page.route() rather than hitting a real
// server, so every scenario here is deterministic.
//
// This complements (does not duplicate) api-timeout-resilience.spec.ts,
// which covers a request that hangs forever. Everything here resolves fast -
// these are explicit failures, not stalls.

guestTest.describe('renderProject — explicit backend error shapes', () => {
  guestTest('a 500 from the project list shows the real error message, not a blank page', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/projects' && url.search === '',
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal server error' }) }),
    );

    await page.goto('/#project/999999');

    const errorState = page.locator('#view-project');
    await guestExpect(errorState).toContainText('Internal server error', { timeout: 10000 });
  });

  guestTest('a dropped connection surfaces an error quickly, distinct from the 15s timeout path', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/projects' && url.search === '',
      (route) => route.abort('failed'),
    );

    const start = Date.now();
    await page.goto('/#project/1');

    const errorState = page.locator('#view-project .text-red-500');
    await guestExpect(errorState).toBeVisible({ timeout: 5000 });
    guestExpect(Date.now() - start).toBeLessThan(5000);
  });

  guestTest('a deep link to a project absent from the list shows "Project not found", not a crash', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/projects' && url.search === '',
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) }),
    );

    await page.goto('/#project/424242');

    await guestExpect(page.locator('#view-project')).toContainText('Project not found', { timeout: 10000 });
  });
});

authTest.describe('renderProject — session and data edge cases', () => {
  authTest('a 401 mid-session reopens the sign-in modal instead of leaving a dead screen', async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.route(
      (url) => url.pathname === '/api/projects' && url.search === '',
      (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid or expired token' }) }),
    );

    await page.goto('/#project/1');

    await authExpect(page.locator('#auth-modal')).toBeVisible({ timeout: 10000 });
    const storedToken = await page.evaluate(() => localStorage.getItem('tf_token'));
    authExpect(storedToken).toBeNull();
  });

  authTest.describe('with a real seeded project (real suites, mocked stats)', () => {
    let projectId: number;

    authTest.beforeEach(async ({ authedRequest }) => {
      const res = await authedRequest.post('/api/demo/testflow');
      authExpect(res.ok()).toBeTruthy();
      projectId = (await res.json()).id;
    });

    authTest.afterEach(async ({ authedRequest }) => {
      await authedRequest.delete(`/api/projects/${projectId}`).catch(() => {});
    });

    authTest('a stats response missing every field renders zeros, never the literal "undefined"', async ({ page, authToken }) => {
      await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
      await page.route(
        (url) => url.pathname === `/api/projects/${projectId}/stats`,
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
      );

      await page.goto(`/#project/${projectId}`);

      const view = page.locator('#view-project');
      await authExpect(view.getByRole('heading', { name: 'Test Suites' })).toBeVisible({ timeout: 10000 });
      const text = await view.innerText();
      authExpect(text).not.toMatch(/undefined/i);
    });

    authTest('a slow-but-successful stats response still renders once it resolves (not misfired as a timeout error)', async ({ page, authToken }) => {
      await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
      await page.route(
        (url) => url.pathname === `/api/projects/${projectId}/stats`,
        async (route) => {
          await new Promise((r) => setTimeout(r, 3000));
          await route.continue();
        },
      );

      await page.goto(`/#project/${projectId}`);

      // Still loading, not yet errored, while the delayed response is in flight.
      await authExpect(page.locator('#view-project .text-red-500')).toHaveCount(0);
      await authExpect(page.locator('#view-project').getByRole('heading', { name: 'Test Suites' })).toBeVisible({ timeout: 10000 });
    });

    authTest('a failed stats fetch fails the whole render cleanly, never a half-rendered page mixing suites with an error', async ({ page, authToken }) => {
      await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
      await page.route(
        (url) => url.pathname === `/api/projects/${projectId}/stats`,
        (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'stats query failed' }) }),
      );

      await page.goto(`/#project/${projectId}`);

      const view = page.locator('#view-project');
      await authExpect(view).toContainText('stats query failed', { timeout: 10000 });
      await authExpect(view.getByRole('heading', { name: 'Test Suites' })).toHaveCount(0);
    });
  });
});
