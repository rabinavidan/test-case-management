import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 3 of the portfolio plan: Test Pyramid + Shift-Left + AI-First
// Quality Engineering. Test counts are real numbers measured directly from
// this repo's own suites (pytest --collect-only per layer, `playwright
// test --list` for the TS suite, @Test counts for the Java suites) - these
// assertions double as a guard against the displayed counts silently
// drifting from what's actually true.

guestTest.describe('Guest recruiter view — Test Pyramid & AI-First Engineering', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('the Test Pyramid section shows all four levels with real counts', async ({ page }) => {
    const section = page.getByTestId('test-pyramid-section');
    await guestExpect(section).toBeVisible();

    await guestExpect(section.getByText('Unit', { exact: true })).toBeVisible();
    await guestExpect(section.getByText('Component', { exact: true })).toBeVisible();
    await guestExpect(section.getByText('API / Integration / Contract')).toBeVisible();
    await guestExpect(section.getByText('E2E', { exact: true })).toBeVisible();

    await guestExpect(section.getByText('220 tests')).toBeVisible();
    await guestExpect(section.getByText('145 tests')).toBeVisible();
    await guestExpect(section.getByText('237 tests')).toBeVisible();
    await guestExpect(section.getByText('104 tests')).toBeVisible();
  });

  guestTest('the Shift-Left strategy statement is present', async ({ page }) => {
    const section = page.getByTestId('test-pyramid-section');
    await guestExpect(section.getByText(/Shift-Left strategy/i)).toBeVisible();
    await guestExpect(section.getByText(/critical customer journeys/i)).toBeVisible();
  });

  guestTest('the AI-First Engineering section shows at least four repo-backed workflows', async ({ page }) => {
    const section = page.getByTestId('ai-first-engineering-section');
    await guestExpect(section).toBeVisible();
    await guestExpect(section.getByText('AI Test-Case Generation')).toBeVisible();
    await guestExpect(section.getByText('Test-Plan Gap Review')).toBeVisible();
    await guestExpect(section.getByText('Coverage-Gap Agent')).toBeVisible();
    await guestExpect(section.getByText('Flaky-Test Detection')).toBeVisible();
    await guestExpect(section.getByText('AI PR Steward')).toBeVisible();
    await guestExpect(section.getByText('Playwright Planning, Generation & Healing')).toBeVisible();
  });

  guestTest('the "See the pipeline" button opens a static AI-pipeline walkthrough modal', async ({ page }) => {
    const section = page.getByTestId('ai-first-engineering-section');
    const demoButton = section.getByTestId('ai-pipeline-demo-btn');
    await guestExpect(demoButton).toBeVisible();
    await guestExpect(demoButton).toHaveText(/See the pipeline/);

    await demoButton.click();

    const modalBox = page.getByTestId('modal-box');
    await guestExpect(modalBox).toBeVisible();
    await guestExpect(page.getByTestId('modal-title')).toHaveText(/AI Agents in This Repo/);

    const demo = page.getByTestId('ai-pipeline-demo');
    await guestExpect(demo).toBeVisible();
    await guestExpect(demo.getByText('Static walkthrough — not a live AI call')).toBeVisible();
    await guestExpect(demo.getByText('AI PR Steward')).toBeVisible();
    await guestExpect(demo.getByText('Playwright Healer')).toBeVisible();
    await guestExpect(demo.getByText('CI green → merged')).toBeVisible();

    await page.getByTestId('modal-close-btn').click();
    await guestExpect(page.getByTestId('modal-overlay')).toHaveClass(/hidden/);
  });
});

authTest.describe('Signed-in view — M3 sections are guest-only', () => {
  authTest.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  authTest('Test Pyramid and AI-First Engineering sections do not show for a signed-in user', async ({ page }) => {
    await authExpect(page.getByTestId('test-pyramid-section')).toHaveCount(0);
    await authExpect(page.getByTestId('ai-first-engineering-section')).toHaveCount(0);
    await authExpect(page.getByTestId('ai-pipeline-demo-btn')).toHaveCount(0);
  });
});
