import { test, expect } from '@playwright/test';
import { SuitePage } from '../pages/suite.page';
import {
  mockProject,
  mockProjectList,
  mockRun,
  mockSuite,
  mockAIGenerateResponse,
  mockTriageResponse,
} from '../mocks/factories';
import { fulfillJson, mockAuthSession, byPath } from '../mocks/route-helpers';

/**
 * Fully serverless (mocked) coverage of the AI-assisted features — test
 * case generation and failure triage — see e2e/README.md's "Serverless
 * mocked E2E tests" section. Both features call out to an AI provider on
 * the real backend (Claude Haiku); mocking them here keeps this coverage
 * fast and deterministic and, critically, lets us exercise the AI error
 * paths (503 unavailable, malformed JSON) on demand, which is hard to
 * trigger reliably against a live provider.
 */

// static/app.js's renderSuite has no per-ID GET endpoint: it fetches the
// full /api/projects list, then each project's /api/projects/{id}/suites,
// to find the target suite client-side — mirrored below, see
// mocked-serverless-crud.spec.ts's note on the same pattern.

test.describe('AI test case generation — serverless', () => {
  test('generating test cases shows the mocked results', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'AI Project' });
    const suite = mockSuite({ project_id: project.id, name: 'AI Suite' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));

    const generated = mockAIGenerateResponse({
      test_cases: [
        {
          title: 'User logs in with valid credentials',
          description: 'Happy-path login',
          steps: '1. Enter valid email/password\n2. Submit',
          expected_result: 'User is redirected to the dashboard',
          priority: 'high',
        },
      ],
    });
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate`,
      (route) => fulfillJson(route, 200, generated),
    );

    const suitePage = new SuitePage(page);
    await suitePage.goto(suite.id);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill('User login with email and password');
    await page.locator('#ai-generate-btn').click();

    await expect(page.locator('#ai-results')).toContainText('User logs in with valid credentials');
    await expect(page.locator('#ai-results')).toContainText(generated.model);
  });

  test('a 503 from the AI provider shows the real error message in the modal', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'AI Project' });
    const suite = mockSuite({ project_id: project.id, name: 'AI Suite' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate`,
      (route) =>
        fulfillJson(route, 503, { detail: 'AI provider temporarily unavailable, please try again shortly' }),
    );

    const suitePage = new SuitePage(page);
    await suitePage.goto(suite.id);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill('User login with email and password');
    await page.locator('#ai-generate-btn').click();

    await expect(page.locator('#ai-error')).toBeVisible();
    await expect(page.locator('#ai-error')).toContainText('AI provider temporarily unavailable');
  });

  test('a malformed JSON body from the generate endpoint fails cleanly, not with a blank modal', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'AI Project' });
    const suite = mockSuite({ project_id: project.id, name: 'AI Suite' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate`,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid json' }),
    );

    const suitePage = new SuitePage(page);
    await suitePage.goto(suite.id);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill('User login with email and password');
    await page.locator('#ai-generate-btn').click();

    await expect(page.locator('#ai-error')).toBeVisible();
  });
});

test.describe('AI failure triage — serverless', () => {
  test('running triage on a run shows the mocked summary and problem results', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Triage Project' });
    const suite = mockSuite({ project_id: project.id, name: 'Triage Suite' });
    const run = mockRun({ suite_id: suite.id, name: 'Nightly Run' });

    await page.route(byPath(`/api/runs/${run.id}`), (route) => fulfillJson(route, 200, run));
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));

    const triage = mockTriageResponse({
      summary: 'All failures trace back to a stale test fixture.',
      problem_results: [
        { testcase_id: 555, title: 'Checkout with expired coupon', status: 'fail', notes: 'Fixture predates the new pricing rules' },
      ],
    });
    await page.route(byPath(`/api/runs/${run.id}/triage`), (route) => fulfillJson(route, 200, triage));

    await page.goto(`/#run/${run.id}`);
    await page.getByRole('button', { name: 'AI Triage' }).click();

    await expect(page.locator('#modal-body')).toContainText('All failures trace back to a stale test fixture.');
    await expect(page.locator('#modal-body')).toContainText('Checkout with expired coupon');
  });
});
