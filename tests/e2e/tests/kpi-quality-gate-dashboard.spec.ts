import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 4 of the portfolio plan: KPI + Quality-Gate dashboard. Every
// card is either a real, verifiable number or an explicit "Not yet
// measured" state — these tests guard against either drifting into an
// invented number.

guestTest.describe('Guest recruiter view — KPI dashboard', () => {
  guestTest('shows all twelve KPI cards with the separate-concepts disclaimer', async ({ page }) => {
    await page.goto('/#home/kpis');
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('kpi-dashboard-section');
    await guestExpect(section).toBeVisible();

    for (const name of [
      'Code Coverage', 'Pass Rate (live)', 'Test Inventory', 'Quality Gate Status',
      'Flaky Test Rate', 'Heal Success Rate', 'False Heal Rate',
      'AI Call Latency', 'AI Call Cost',
      'Pipeline Execution Time', 'Escaped Defects', 'Release Readiness',
    ]) {
      await guestExpect(section.getByText(name, { exact: true })).toBeVisible();
    }

    await guestExpect(section.getByText(/not the same claim as/i)).toBeVisible();
  });

  guestTest('Code Coverage and Quality Gate Status show real, non-fabricated values', async ({ page }) => {
    await page.goto('/#home/kpis');
    await page.waitForLoadState('networkidle');

    const coverage = page.getByTestId('kpi-card-code-coverage');
    // assertion-change-approved: coverage updated to main's latest CI figure (93.18%)
    await guestExpect(coverage.getByText('93.2%')).toBeVisible();
    await guestExpect(coverage.getByText(/85% floor/)).toBeVisible();
    await guestExpect(coverage.getByText('Healthy')).toBeVisible();

    const gates = page.getByTestId('kpi-card-quality-gate-status');
    await guestExpect(gates.getByText('4 gates enforced')).toBeVisible();
    await guestExpect(gates.getByText('Enforced', { exact: true })).toBeVisible();
  });

  guestTest('KPIs with no real data source are honestly labeled "Not yet measured", never a fake number', async ({ page }) => {
    await page.goto('/#home/kpis');
    await page.waitForLoadState('networkidle');

    for (const testId of [
      'kpi-card-flaky-test-rate', 'kpi-card-heal-success-rate', 'kpi-card-false-heal-rate',
      'kpi-card-ai-call-latency', 'kpi-card-ai-call-cost',
      'kpi-card-escaped-defects', 'kpi-card-release-readiness',
    ]) {
      const card = page.getByTestId(testId);
      await guestExpect(card.getByText('Not yet measured').first()).toBeVisible();
    }
  });

  guestTest('Pipeline Execution Time reflects real GitHub Actions run data, not a fixture', async ({ page, request }) => {
    // /api/ci/pipeline-stats fetches live from the GitHub Actions API and
    // degrades to null fields (never a guessed number) on any failure - so
    // this test checks whichever of those two honest outcomes actually
    // happened, rather than assuming the network call succeeds.
    const res = await request.get('/api/ci/pipeline-stats');
    const stats = await res.json();

    await page.goto('/#home/kpis');
    await page.waitForLoadState('networkidle');
    const card = page.getByTestId('kpi-card-pipeline-execution-time');

    if (stats.mean_duration_seconds != null) {
      await guestExpect(card.getByText(`n=${stats.runs_sampled}`)).toBeVisible({ timeout: 10000 });
      await guestExpect(card.getByText('Healthy')).toBeVisible();
    } else {
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
    await authTest.step('Seed the TestFlow demo project (produces a real completed run)', async () => {
      const res = await authedRequest.post('/api/demo/testflow');
      guestExpect(res.ok()).toBeTruthy();
      createdProjectIds.push((await res.json()).id);
    });

    // Other specs seed TestFlow demo projects in parallel, so the flagship is
    // whichever one the page picks - the first match in the same list it
    // loads - not necessarily the one seeded above.
    const flagshipPassRate = async () => {
      const { items } = await (await authedRequest.get('/api/projects', { params: { page_size: 100 } })).json();
      const flagship = items.find((p: { name: string }) => /^TestFlow \d{4}-\d{2}-\d{2}/.test(p.name));
      const stats = await (await authedRequest.get(`/api/projects/${flagship.id}/stats`)).json();
      const total = stats.last_run_pass + stats.last_run_fail + stats.last_run_skip + stats.last_run_pending;
      return total ? Math.round((stats.last_run_pass / total) * 100) : 0;
    };

    await authTest.step('Visit as a guest and check the KPI card matches the flagship\'s real stats exactly', async () => {
      const card = page.getByTestId('kpi-card-pass-rate-live');
      // Retried as a whole: a project seeded between the API read and the page
      // load would change which project is the flagship.
      await guestExpect(async () => {
        const expected = await flagshipPassRate();
        await page.goto('/#home/kpis');
        await page.waitForLoadState('networkidle');
        await guestExpect(card.getByText(`${expected}%`)).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000 });
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
