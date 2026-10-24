import { test, expect } from '../fixtures/auth.fixture';
import { request, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Accessibility gate: every home tab and every signed-in page must have zero
 * WCAG 2.0/2.1 A and AA violations, as axe-core reports them. CI had no
 * accessibility check, so low-contrast text and unlabeled controls (300+
 * findings at one point) shipped unnoticed; now one fails the build.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Lets entrance animations finish, so axe sees final colors and opacity. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Running, finite ones only - a paused animation (off-screen, say) never
  // finishes - and capped, so a stray long one can't stall the test.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]));
}

async function expectNoViolations(page: Page, label: string) {
  await settle(page);
  // @axe-core/playwright is typed against its own copy of Playwright's Page.
  const axePage = page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'];
  const { violations } = await new AxeBuilder({ page: axePage }).withTags(WCAG).analyze();
  const report = violations.map((v) =>
    `${v.id} (${v.impact}): ${v.nodes.length}× — e.g. ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(report, `${label}: WCAG A/AA violations`).toEqual([]);
}

const HOME_TABS = ['stories', 'repos', 'demo', 'leadership', 'strategy', 'ai', 'kpis', 'architecture', 'projects'];

/** An API client signed in as the e2e user. Worker-scoped setup can't use the
 * test-scoped auth fixtures, so it reads the same token global-setup saved. */
async function signedInApi(): Promise<APIRequestContext> {
  const { token } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'auth-state.json'), 'utf-8'));
  return request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:8000',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

test.describe('Accessibility gate — guest home page', () => {
  // The Projects tab only exists while there is a project to list.
  let api: APIRequestContext;
  let projectId: number;
  test.beforeAll(async () => {
    api = await signedInApi();
    projectId = (await (await api.post('/api/projects', { data: { name: `A11yGate_${Date.now()}` } })).json()).id;
  });
  test.afterAll(async () => {
    await api.delete(`/api/projects/${projectId}`);
    await api.dispose();
  });

  for (const tab of HOME_TABS) {
    test(`the ${tab} tab`, async ({ page }) => {
      await page.goto(`/#home/${tab}`);
      await expect(page.locator(`#home-panel-${tab}`)).toBeVisible();
      await expectNoViolations(page, `home: ${tab}`);
    });
  }
});

test.describe('Accessibility gate — signed-in pages', () => {
  // A demo project brings the architecture diagram, run results and every
  // kind of badge onto its pages.
  let api: APIRequestContext;
  let projectId: number;
  let suiteId: number;
  let runId: number;

  test.beforeAll(async () => {
    api = await signedInApi();
    projectId = (await (await api.post('/api/demo/testflow')).json()).id;
    suiteId = (await (await api.get(`/api/projects/${projectId}/suites`)).json())[0].id;
    runId = (await (await api.get(`/api/suites/${suiteId}/runs`)).json())[0].id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/projects/${projectId}`);
    await api.dispose();
  });

  test.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  for (const [name, hash] of [
    ['projects list', () => '#projects'],
    ['project', () => `#project/${projectId}`],
    ['suite', () => `#suite/${suiteId}`],
    ['test cases', () => `#suite/${suiteId}/testcases`],
    ['run', () => `#run/${runId}`],
    ['environments', () => '#environments'],
    ['users', () => '#users'],
    ['log center', () => '#logs'],
  ] as const) {
    test(`the ${name} page`, async ({ page }) => {
      await page.goto(`/${hash()}`);
      await expect(page.locator('.view:not(.hidden) :is(h1, h2)').first()).toBeVisible();
      await expectNoViolations(page, name);
    });
  }
});
