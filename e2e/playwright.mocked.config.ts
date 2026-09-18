import { defineConfig, devices } from '@playwright/test';

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
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report-mocked' }],
    ['list', { printSteps: true }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8010',
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
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
});
