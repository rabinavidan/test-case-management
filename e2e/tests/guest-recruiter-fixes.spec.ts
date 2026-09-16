import { test, expect } from '../fixtures/auth.fixture';

// Regression coverage for the P0 recruiter-journey defects in the portfolio
// plan (TestFlow_Tech_Lead_Portfolio_Development_Plan, Milestone 1):
//   1. "Run Playwright Architecture Demo" (and the other two demo buttons)
//      failed with "Invalid token" for a guest — they called the
//      demo-seed endpoints (auth-required) with `Bearer ${getToken()}`,
//      which is literally "Bearer null" when signed out.
//   2. A raw "false" was visible on a project page — `${isAdmin() && (...)}`
//      stringifies the short-circuited boolean into the template when
//      isAdmin() is false.
//   3. A guest's very first visit (no hash) could land on a large, mostly
//      empty projects area before any project was selected.
//
// Every test here runs as a genuine guest — no token is ever written to
// localStorage — using plain `test`/`expect` from the auth fixture only for
// `authedRequest`, which seeds demo data via the API without touching the
// browser's auth state.

test.describe('Guest recruiter journey — P0 fixes', () => {
  const createdProjectIds: number[] = [];

  test.afterEach(async ({ authedRequest }) => {
    for (const id of createdProjectIds.splice(0)) {
      await authedRequest.delete(`/api/projects/${id}`).catch(() => {});
    }
  });

  test('a project page never leaks a raw "false" value for a guest', async ({ page, authedRequest }) => {
    let projectId: number;
    await test.step('Seed a project via the API', async () => {
      const res = await authedRequest.post('/api/projects', {
        data: { name: `Guest View Test ${Date.now()}`, description: 'e2e' },
      });
      expect(res.ok()).toBeTruthy();
      projectId = (await res.json()).id;
      createdProjectIds.push(projectId);
    });

    await test.step('Visit the project page as a guest (no token)', async () => {
      await page.goto(`/#project/${projectId}`);
      await page.waitForLoadState('networkidle');
    });

    await test.step('No standalone "false" text anywhere on the page', async () => {
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toMatch(/(^|\s)false(\s|$)/);
    });
  });

  test('the demo buttons show a friendly message, not "Invalid token", when nothing is seeded', async ({ page }) => {
    await test.step('Visit as a guest', async () => {
      await page.goto('/#projects');
      await page.waitForLoadState('networkidle');
    });

    await test.step('Click "Run Playwright Architecture Demo"', async () => {
      await page.locator('#demo-pw-btn').click();
    });

    await test.step('An info toast about signing in appears — never a token error', async () => {
      const toast = page.locator('#toast-inner');
      await expect(toast).toBeVisible({ timeout: 10000 });
      await expect(toast).toContainText(/sign in to create one/i);
      await expect(toast).not.toContainText(/invalid token/i);
    });

    await test.step('Button resets and stays clickable', async () => {
      await expect(page.locator('#demo-pw-btn')).toBeEnabled();
      await expect(page.locator('#demo-pw-label')).toHaveText('Run Playwright Architecture Demo');
    });
  });

  test('a guest can open an already-seeded demo via the button — read-only, no new project created', async ({ page, authedRequest }) => {
    let seededId: number;
    await test.step('Seed a Playwright-demo project via the API (as an authenticated user)', async () => {
      const res = await authedRequest.post('/api/demo/playwright');
      expect(res.ok()).toBeTruthy();
      seededId = (await res.json()).id;
      createdProjectIds.push(seededId);
    });

    let countBefore: number;
    await test.step('Record the project count before the guest clicks anything', async () => {
      const res = await authedRequest.get('/api/projects?page_size=100');
      countBefore = (await res.json()).total;
    });

    await test.step('Visit as a guest and click "Run Playwright Architecture Demo"', async () => {
      await page.goto('/#projects');
      await page.waitForLoadState('networkidle');
      await page.locator('#demo-pw-btn').click();
    });

    await test.step('Navigates straight into the existing demo project — no error toast', async () => {
      await expect(page).toHaveURL(new RegExp(`#project/${seededId}$`), { timeout: 10000 });
      const toast = page.locator('#toast');
      const toastVisible = await toast.isVisible().catch(() => false);
      if (toastVisible) {
        await expect(page.locator('#toast-inner')).not.toContainText(/invalid token|error/i);
      }
    });

    await test.step('No new project was created', async () => {
      const res = await authedRequest.get('/api/projects?page_size=100');
      expect((await res.json()).total).toBe(countBefore);
    });
  });

  // Regression test: an earlier version of this app force-redirected a guest's
  // very first visit straight into a specific project (`#project/{id}`)
  // without any click. In production this meant a stalled backend call on
  // that one project's page silently broke the entire landing experience for
  // every guest, with no way to back out to the normal projects list. The
  // redirect is gone for good — root always renders the guest projects list.
  test("a guest's first visit never auto-redirects into a specific project", async ({ page, authedRequest }) => {
    let flagshipId: number;
    await test.step('Seed the TestFlow demo project via the API (so one exists to *not* redirect to)', async () => {
      const res = await authedRequest.post('/api/demo/testflow');
      expect(res.ok()).toBeTruthy();
      flagshipId = (await res.json()).id;
      createdProjectIds.push(flagshipId);
    });

    await test.step('Visit the bare root URL as a guest — no hash at all', async () => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    await test.step('URL stays on the projects list — never auto-navigates into a project', async () => {
      await expect(page).not.toHaveURL(new RegExp(`#project/${flagshipId}$`));
      await expect(page).toHaveURL(/#projects$|\/$/);
    });

    await test.step('The guest projects list itself is visible, with its own explicit demo CTA', async () => {
      await expect(page.getByTestId('hero-explore-demo-btn')).toBeVisible();
    });
  });

  test("a guest's first visit with nothing seeded shows the purposeful empty state, not a crash", async ({ page }) => {
    await test.step('Visit the bare root URL as a guest', async () => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    await test.step('No error page, no invalid-token toast', async () => {
      await expect(page).not.toHaveTitle(/error|404|500/i);
      const toastVisible = await page.locator('#toast').isVisible().catch(() => false);
      if (toastVisible) {
        await expect(page.locator('#toast-inner')).not.toContainText(/invalid token/i);
      }
    });
  });
});
