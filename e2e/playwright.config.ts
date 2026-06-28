import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list', { printSteps: true }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Capture all console output (log.*) so it appears in the HTML report
    trace: 'retain-on-failure',
  },
  globalSetup: './global-setup.ts',
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
