import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 6 of the portfolio plan: accessibility, responsiveness, and
// release readiness for the guest recruiter journey built in M1-M5.

const LONG_PROJECT_NAME = 'A deliberately long project name that must be truncated in the sidebar and card views to prove the full text is still reachable via a tooltip';

authTest.describe('Long labels are truncated visually but never lose the full text', () => {
  let projectId: number;

  authTest.beforeEach(async ({ authedRequest }) => {
    const res = await authedRequest.post('/api/projects', { data: { name: LONG_PROJECT_NAME, description: 'irrelevant' } });
    authExpect(res.ok()).toBeTruthy();
    projectId = (await res.json()).id;
  });

  authTest.afterEach(async ({ authedRequest }) => {
    await authedRequest.delete(`/api/projects/${projectId}`).catch(() => {});
  });

  authTest('the sidebar project link exposes the full name via title', async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const link = page.getByTestId(`sidebar-project-${projectId}`);
    await authExpect(link).toBeVisible();
    await authExpect(link).toHaveAttribute('title', LONG_PROJECT_NAME);
  });

  authTest('the project list row exposes the full name via title', async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const name = page.getByTestId(`project-name-${projectId}`);
    await authExpect(name).toBeVisible();
    await authExpect(name).toHaveAttribute('title', LONG_PROJECT_NAME);
  });
});

guestTest.describe('Guest recruiter view — semantic structure', () => {
  guestTest('the Architecture Decisions & Trade-offs block is a real heading, not a styled paragraph', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('hero-architecture-btn').click();

    const heading = page.getByRole('heading', { name: 'Architecture Decisions & Trade-offs' });
    await guestExpect(heading).toBeVisible({ timeout: 5000 });
  });
});

guestTest.describe('Guest recruiter view — Recruiter Tour keyboard operation', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('opening the tour moves focus into the dialog', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    const active = page.locator(':focus');
    await guestExpect(active).toHaveAttribute('data-testid', 'tour-next-btn');
  });

  guestTest('Escape closes the tour and returns focus to the Start Tour button', async ({ page }) => {
    const startBtn = page.getByTestId('start-tour-btn');
    await startBtn.click();
    await guestExpect(page.getByTestId('recruiter-tour-card')).toBeVisible();

    await page.keyboard.press('Escape');
    await guestExpect(page.getByTestId('recruiter-tour-card')).toHaveCount(0);
    await guestExpect(startBtn).toBeFocused();
  });

  guestTest('Tab from the last control wraps back to the first, keeping focus inside the dialog', async ({ page }) => {
    await page.getByTestId('start-tour-btn').click();
    await page.getByTestId('tour-next-btn').click(); // step 2 - now has a Back button too

    await page.getByTestId('tour-next-btn').focus();
    await page.keyboard.press('Tab');
    const active = page.locator(':focus');
    await guestExpect(active).toHaveAttribute('data-testid', 'tour-exit-btn');
  });
});

guestTest.describe('Guest recruiter view — reduced motion is honored', () => {
  guestTest('continuous decorative animations are neutralized when the visitor prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const duration = await page.locator('.owner-title-flash').evaluate((el) => getComputedStyle(el).animationDuration);
    // Every comma-separated value must collapse to (near-)zero once the
    // reduced-motion override applies.
    for (const d of duration.split(',')) {
      guestExpect(parseFloat(d)).toBeLessThan(0.01);
    }
  });
});

for (const width of [375, 768, 1024, 1440]) {
  guestTest(`no horizontal overflow on the guest projects page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // Small tolerance for the pre-existing horizontally-scrolling pipeline banner
    // (#tf-demo): its own internal overflow-x-auto can leak a few px of scrollWidth
    // into the document in browsers/environments where the Tailwind CDN stylesheet
    // hasn't loaded (e.g. this sandbox's TLS-intercepting proxy blocks it outright -
    // confirmed via window.tailwind being undefined and ERR_CERT_AUTHORITY_INVALID
    // on cdn.tailwindcss.com). A genuine broken layout overflows by hundreds of px,
    // not single digits.
    guestExpect(overflow).toBeLessThanOrEqual(20);
  });
}
