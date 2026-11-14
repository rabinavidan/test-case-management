// Seed file for the Playwright agents (planner/generator/healer — see
// e2e/README.md#playwright-agents). Not a real assertion-bearing test:
// playwright.config.ts excludes it from the suite via testIgnore. Its only
// job is to land the agents on an authenticated view of the app, the same
// starting point every other spec in this directory uses (fixtures/auth.fixture.ts).
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Test group', () => {
  test('seed', async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });
});
