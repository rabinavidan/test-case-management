import { test, expect } from '@playwright/test';
import { ProjectsPage } from '../pages/projects.page';
import { mockProject, mockProjectList, mockSuite } from '../mocks/factories';
import { fulfillJson, mockAuthSession, byPath } from '../mocks/route-helpers';

// static/app.js's renderSuite/renderProject have no per-ID GET endpoint:
// they fetch the full /api/projects list (and, for a suite, every
// project's /api/projects/{id}/suites) to find the target client-side —
// mirrored below, see mocked-serverless-crud.spec.ts's note on the same
// pattern.

/**
 * Fully serverless (mocked) coverage of backend error/edge responses —
 * see e2e/README.md's "Serverless mocked E2E tests" section. Unlike
 * e2e/tests/mocked-api-errors.spec.ts (which mixes a real backend with
 * selective mocking), every request here is intercepted, so these run
 * under playwright.mocked.config.ts with no FastAPI process at all.
 */

test.describe('Generic error responses — serverless', () => {
  test('a 500 from the project list shows the real error message, not a blank page', async ({ page }) => {
    await mockAuthSession(page);
    await page.route(byPath('/api/projects'), (route) =>
      fulfillJson(route, 500, { detail: 'Internal server error' }),
    );

    await page.goto('/#project/999999');

    await expect(page.locator('#view-project')).toContainText('Internal server error', { timeout: 10000 });
  });

  test('a dropped connection surfaces an error quickly', async ({ page }) => {
    await mockAuthSession(page);
    await page.route(byPath('/api/projects'), (route) => route.abort('failed'));

    const start = Date.now();
    await page.goto('/#project/1');

    await expect(page.locator('#view-project .text-red-500')).toBeVisible({ timeout: 5000 });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('a 429 rate-limit response on the AI generate endpoint surfaces the real message', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Rate Limited Project' });
    const suite = mockSuite({ project_id: project.id, name: 'Rate Limited Suite' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate`,
      (route) => fulfillJson(route, 429, { detail: 'Rate limit exceeded, please slow down' }),
    );

    await page.goto(`/#suite/${suite.id}`);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill('Something to generate tests for');
    await page.locator('#ai-generate-btn').click();

    await expect(page.locator('#ai-error')).toContainText('Rate limit exceeded');
  });

  test('a deep link to a project absent from the mocked list shows "Project not found"', async ({ page }) => {
    await mockAuthSession(page);
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([])));

    await page.goto('/#project/424242');

    await expect(page.locator('#view-project')).toContainText('Project not found', { timeout: 10000 });
  });
});

test.describe('Auth edge cases — serverless', () => {
  test('a 401 mid-session reopens the sign-in modal instead of leaving a dead screen', async ({ page }) => {
    await mockAuthSession(page);
    await page.route(byPath('/api/projects'), (route) =>
      fulfillJson(route, 401, { detail: 'Invalid or expired token' }),
    );

    await page.goto('/#project/1');

    await expect(page.locator('#auth-modal')).toBeVisible({ timeout: 10000 });
    const storedToken = await page.evaluate(() => localStorage.getItem('tf_token'));
    expect(storedToken).toBeNull();
  });

  test('with no admin account set up yet, the app opens straight to the setup form', async ({ page }) => {
    // No token seeded, so the app never calls /api/auth/me at all (see
    // static/app.js's bootstrap: it's only called when a stored token
    // exists) — instead it checks /api/auth/setup and, on a fresh
    // install, opens the sign-in modal in "setup" mode.
    await page.route(byPath('/api/auth/setup'), (route) => fulfillJson(route, 200, { setup_needed: true }));

    await page.goto('/');

    await expect(page.locator('#auth-modal')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Malformed/partial data — serverless', () => {
  test('a stats response missing every field renders zeros, never the literal "undefined"', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Stats Project' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/projects/${project.id}/stats`), (route) => fulfillJson(route, 200, {}));

    await page.goto(`/#project/${project.id}`);

    const view = page.locator('#view-project');
    await expect(view.getByRole('heading', { name: 'Test Suites' })).toBeVisible({ timeout: 10000 });
    const text = await view.innerText();
    expect(text).not.toMatch(/undefined/i);
  });

  test('a paginated projects response with items missing falls back to an empty list, not a crash', async ({ page }) => {
    await mockAuthSession(page);
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, { total: 0 }));

    const projectsPage = new ProjectsPage(page);
    await projectsPage.goto();

    await expect(projectsPage.getProjectCards()).toHaveCount(0);
  });
});
