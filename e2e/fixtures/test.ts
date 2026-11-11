/**
 * The test entry point for layered specs: `import { test, expect } from '../fixtures/test'`.
 *
 *   spec  ──▶  flows/  ──▶  pages/ (UI)  ──▶  Playwright Page
 *     │                └─▶  api/   (HTTP) ──▶  Playwright APIRequestContext
 *     └── fixtures/ (this file) wires them together per test
 *
 * A spec states the scenario and the expectations; it never builds a URL,
 * a selector or an Authorization header. eslint.config.mjs enforces that.
 */
import type { Page } from '@playwright/test';
import { test as authTest } from './auth.fixture';
import { TestFlowApi } from '../api/testflow.api';
import { TestFlowApp } from '../flows/app';
import { aProject, aSuite } from '../data/builders';
import type { Project, Suite } from '../data/types';

export interface SeededSuite {
  project: Project;
  suite: Suite;
}

type LayeredFixtures = {
  /** Backend facade; deletes every project it created after the test. */
  api: TestFlowApi;
  /** A page whose SPA is already authenticated as the e2e user. */
  signedInPage: Page;
  /** Page objects for the signed-in app, grouped by screen. */
  app: TestFlowApp;
  /** A fresh, empty project owned by this test. */
  project: Project;
  /** A fresh project with one empty suite, owned by this test. */
  seededSuite: SeededSuite;
};

export const test = authTest.extend<LayeredFixtures>({
  api: async ({ request, authToken }, use) => {
    const api = new TestFlowApi(request, authToken);
    await use(api);
    await api.dispose();
  },

  signedInPage: async ({ page, authToken }, use) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await use(page);
  },

  app: async ({ signedInPage }, use) => {
    await use(new TestFlowApp(signedInPage));
  },

  project: async ({ api }, use) => {
    await use(await api.projects.create(aProject()));
  },

  seededSuite: async ({ api, project }, use) => {
    const suite = await api.suites.create(project.id, aSuite());
    await use({ project, suite });
  },
});

export { expect } from '@playwright/test';
