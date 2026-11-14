import { defineConfig, devices } from '@playwright/test';
import { config } from './config/env';

/**
 * Serverless mocked E2E config — see e2e/README.md's "Serverless mocked
 * E2E tests" section. Runs only `mocked-serverless-*.spec.ts`, every API
 * call intercepted via page.route() (e2e/mocks/), against a plain static
 * file server for `static/` (no FastAPI, no database, no globalSetup
 * login round-trip, unlike playwright.config.ts).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/mocked-serverless-*.spec.ts',
  timeout: config.timeouts.test,
  retries: config.isCI ? 1 : 0,
  reporter: [
    ['list', { printSteps: true }],
    ['allure-playwright', { resultsDir: 'allure-results-mocked', detail: true, suiteTitle: false }],
  ],
  use: {
    baseURL: config.mockedBaseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: config.chromiumPath ? { executablePath: config.chromiumPath } : {},
      },
    },
  ],
});
