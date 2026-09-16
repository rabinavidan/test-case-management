import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 4 of the portfolio plan: KPI + Quality-Gate dashboard. Every
// card is either a real, verifiable number or an explicit "Not yet
// measured" state — these tests guard against either drifting into an
// invented number.

guestTest.describe('Guest recruiter view — KPI dashboard', () => {
  guestTest('shows all eight KPI cards with the separate-concepts disclaimer', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('kpi-dashboard-section');
    await guestExpect(section).toBeVisible();

    for (const name of [
      'Code Coverage', 'Pass Rate (live)', 'Test Inventory', 'Quality Gate Status',
      'Flaky Test Rate', 'Pipeline Execution Time', 'Escaped Defects', 'Release Readiness',
    ]) {
      await guestExpect(section.getByText(name, { exact: true })).toBeVisible();
    }

    await guestExpect(section.getByText(/not the same claim as/i)).toBeVisible();
  });

  guestTest('Code Coverage and Quality Gate Status show real, non-fabricated values', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    const coverage = page.getByTestId('kpi-card-code-coverage');
    await guestExpect(coverage.getByText('89.1%')).toBeVisible();
    await guestExpect(coverage.getByText(/85% floor/)).toBeVisible();
    await guestExpect(coverage.getByText('Healthy')).toBeVisible();

    const gates = page.getByTestId('kpi-card-quality-gate-status');
    await guestExpect(gates.getByText('4 gates enforced')).toBeVisible();
    await guestExpect(gates.getByText('Enforced', { exact: true })).toBeVisible();
  });

  guestTest('KPIs with no real data source are honestly labeled "Not yet measured", never a fake number', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');

    for (const testId of ['kpi-card-flaky-test-rate', 'kpi-card-pipeline-execution-time', 'kpi-card-escaped-defects', 'kpi-card-release-readiness']) {
      const card = page.getByTestId(testId);
      await guestExpect(card.getByText('Not yet measured').first()).toBeVisible();
    }
  });
});

authTest.describe('Pass Rate KPI — live data from the flagship project', () => {
  const createdProjectIds: number[] = [];

  authTest.afterEach(async ({ authedRequest }) => {
    for (const id of createdProjectIds.splice(0)) {
      await authedRequest.delete(`/api/projects/${id}`).catch(() => {});
    }
  });

  authTest('reflects the flagship project\'s real, live stats — not a fixture', async ({ page, authedRequest }) => {
    let flagshipId: number;
    let expectedPassRate: number;

    await authTest.step('Seed the TestFlow demo project (produces a real completed run)', async () => {
      const res = await authedRequest.post('/api/demo/testflow');
      guestExpect(res.ok()).toBeTruthy();
      flagshipId = (await res.json()).id;
      createdProjectIds.push(flagshipId);
    });

    await authTest.step('Read the real stats via the API to know what to expect', async () => {
      const res = await authedRequest.get(`/api/projects/${flagshipId}/stats`);
      const stats = await res.json();
      const total = stats.last_run_pass + stats.last_run_fail + stats.last_run_skip + stats.last_run_pending;
      expectedPassRate = total ? Math.round((stats.last_run_pass / total) * 100) : 0;
    });

    await authTest.step('Visit as a guest and check the KPI card matches exactly', async () => {
      await page.goto('/#projects');
      await page.waitForLoadState('networkidle');
      const card = page.getByTestId('kpi-card-pass-rate-live');
      await guestExpect(card.getByText(`${expectedPassRate}%`)).toBeVisible({ timeout: 10000 });
    });
  });
});

authTest.describe('Signed-in view — KPI dashboard is guest-only', () => {
  authTest.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  authTest('does not show for a signed-in user', async ({ page }) => {
    await authExpect(page.getByTestId('kpi-dashboard-section')).toHaveCount(0);
  });
});
