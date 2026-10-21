import { defineConfig, devices } from '@playwright/test';

// seed.spec.ts is the Playwright agents' authoring seed (e2e/README.md#playwright-agents),
// not a real assertion-bearing test. mocked-serverless-*.spec.ts run under
// playwright.mocked.config.ts instead (no globalSetup — they never hit a
// real backend), so both are excluded here to avoid duplicate runs.
const IGNORED = ['**/seed.spec.ts', '**/mocked-serverless-*.spec.ts'];
// responsive.spec.ts runs only on the phone/tablet projects below, and they
// run only it: the rest of the suite assumes a desktop layout (the sidebar).
const RESPONSIVE = '**/responsive.spec.ts';

export default defineConfig({
  testDir: './tests',
  testIgnore: IGNORED,
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list', { printSteps: true }],
    // json feeds pw-ts.yml's job-summary script only — Allure (below) is
    // this project's human-facing report, not a plain HTML one.
    ['json', { outputFile: 'test-results/results.json' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: false }],
    // blob is what CI's sharded matrix (.github/workflows/pw-ts.yml) merges
    // back into one JSON report via `playwright merge-reports` — not useful
    // for a local, unsharded run, so only enabled under CI.
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
      testIgnore: [...IGNORED, RESPONSIVE],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
    {
      name: 'firefox',
      testIgnore: [...IGNORED, RESPONSIVE],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: [...IGNORED, RESPONSIVE],
      use: { ...devices['Desktop Safari'] },
    },
    // Real device emulation (viewport, touch, isMobile, user agent). Firefox
    // has no isMobile support, so phones run on Chromium and WebKit.
    { name: 'mobile-chrome', testMatch: RESPONSIVE, use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', testMatch: RESPONSIVE, use: { ...devices['iPhone 13'] } },
    { name: 'tablet', testMatch: RESPONSIVE, use: { ...devices['iPad (gen 7)'] } },
  ],
});
