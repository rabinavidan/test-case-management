import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // seed.spec.ts is the Playwright agents' authoring seed (e2e/README.md#playwright-agents),
  // not a real assertion-bearing test. mocked-serverless-*.spec.ts run under
  // playwright.mocked.config.ts instead (no globalSetup — they never hit a
  // real backend), so both are excluded here to avoid duplicate runs.
  testIgnore: ['**/seed.spec.ts', '**/mocked-serverless-*.spec.ts'],
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list', { printSteps: true }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: false }],
    // blob is what CI's sharded matrix (.github/workflows/pw-ts.yml) merges
    // back into one HTML/JSON report via `playwright merge-reports` — not
    // useful for a local, unsharded run, so only enabled under CI.
    ...(process.env.CI ? [['blob', { outputDir: 'blob-report' }] as const] : []),
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // off by default; run with --project=webkit to enable
    },
  ],
});
