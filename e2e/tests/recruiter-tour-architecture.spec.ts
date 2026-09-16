import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 5 of the portfolio plan: Architecture story + Recruiter Tour.
// The tour is read-only and requires no auth — every assertion here runs
// as a genuine guest, and none of it creates or modifies data.

guestTest.describe('Guest recruiter view — Architecture story', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('"View Architecture" reveals real, sourced architecture-decisions content', async ({ page }) => {
    await page.getByTestId('hero-architecture-btn').click();
    const section = page.getByTestId('architecture-story-section');
    await guestExpect(section).toBeVisible({ timeout: 5000 });

    await guestExpect(section.getByText('Why five services')).toBeVisible();
    await guestExpect(section.getByText('Ownership & boundaries')).toBeVisible();
    await guestExpect(section.getByText('Redis / WebSocket event flow')).toBeVisible();
    await guestExpect(section.getByText('PostgreSQL schema separation')).toBeVisible();
    await guestExpect(section.getByText('Docker & Kubernetes deployment')).toBeVisible();
    await guestExpect(section.getByText('Observability & failure diagnostics')).toBeVisible();
    await guestExpect(section.getByText(/Trade-offs, found by testing/)).toBeVisible();
  });
});

guestTest.describe('Guest recruiter view — Recruiter Tour', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('the tour banner is visible with a Start button', async ({ page }) => {
    const banner = page.getByTestId('recruiter-tour-banner');
    await guestExpect(banner).toBeVisible();
    await guestExpect(page.getByTestId('start-tour-btn')).toBeVisible();
  });

  guestTest('starting the tour opens on step 1 of 5 — Leadership Profile', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    const card = page.getByTestId('recruiter-tour-card');
    await guestExpect(card).toBeVisible();
    await guestExpect(page.getByTestId('tour-step-label')).toHaveText(/Step 1 of 5/);
    await guestExpect(card.getByText('Leadership Profile')).toBeVisible();
    // No Back button on the first step.
    await guestExpect(page.getByTestId('tour-prev-btn')).toHaveCount(0);
  });

  guestTest('Next advances through all five steps, ending in Finish', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();

    const titles = ['Leadership Profile', 'System Architecture', 'Test Strategy', 'CI/CD Quality Gates & KPIs', 'AI Engineering & Source'];
    for (let i = 0; i < titles.length; i++) {
      await guestExpect(page.getByTestId('tour-step-label')).toHaveText(new RegExp(`Step ${i + 1} of 5`));
      await guestExpect(page.getByTestId('recruiter-tour-card').getByText(titles[i])).toBeVisible();
      if (i < titles.length - 1) {
        await guestExpect(page.getByTestId('tour-next-btn')).toHaveText('Next');
        await page.getByTestId('tour-next-btn').click();
      }
    }
    await guestExpect(page.getByTestId('tour-next-btn')).toHaveText('Finish');
  });

  guestTest('step 2 (System Architecture) expands the showcase panel', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    await page.getByTestId('tour-next-btn').click(); // -> step 2

    await guestExpect(page.getByTestId('tour-step-label')).toHaveText(/Step 2 of 5/);
    await guestExpect(page.locator('#showcase-content')).toBeVisible({ timeout: 5000 });
  });

  guestTest('Back returns to the previous step', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    await page.getByTestId('tour-next-btn').click(); // step 2
    await page.getByTestId('tour-next-btn').click(); // step 3
    await guestExpect(page.getByTestId('tour-step-label')).toHaveText(/Step 3 of 5/);

    await page.getByTestId('tour-prev-btn').click();
    await guestExpect(page.getByTestId('tour-step-label')).toHaveText(/Step 2 of 5/);
  });

  guestTest('the tour can be exited at any step', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    await page.getByTestId('tour-next-btn').click();
    await page.getByTestId('tour-exit-btn').click();
    await guestExpect(page.getByTestId('recruiter-tour-card')).toHaveCount(0);
  });

  guestTest('finishing the tour (Finish on the last step) closes it', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    for (let i = 0; i < 4; i++) await page.getByTestId('tour-next-btn').click();
    await guestExpect(page.getByTestId('tour-next-btn')).toHaveText('Finish');
    await page.getByTestId('tour-next-btn').click();
    await guestExpect(page.getByTestId('recruiter-tour-card')).toHaveCount(0);
  });
});

authTest.describe('Signed-in view — Recruiter Tour banner is guest-only', () => {
  authTest.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  authTest('does not show for a signed-in user', async ({ page }) => {
    await authExpect(page.getByTestId('recruiter-tour-banner')).toHaveCount(0);
  });
});
