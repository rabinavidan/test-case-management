import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/login.page';
import { ProjectsPage } from '../pages/projects.page';
import { ProjectPage } from '../pages/project.page';
import { SuitePage } from '../pages/suite.page';
import { RunPage } from '../pages/run.page';

// One continuous journey through every authenticated page, driven only
// through the UI — the per-page specs seed their data over the API, so none
// of them proves the pages actually link together. The API is used here only
// to clean up. Credentials are global-setup.ts's e2e user.
const USERNAME = 'testuser_e2e';
const PASSWORD = 'Test@12345';

test.describe('User journey — sign in to sign out', () => {
  // Per test, not per file: workers load this module at the same moment, so a
  // module-level Date.now() can repeat across workers — and then one worker's
  // cleanup deletes the project another worker is still using.
  let uid = '';
  let projectName = '';
  let suiteName = '';

  test.beforeEach(async ({}, testInfo) => {
    uid = `${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
    projectName = `Journey_${uid}`;
    suiteName = `Checkout_${uid}`;
  });

  test.afterEach(async ({ authedRequest }) => {
    const res = await authedRequest.get('/api/projects', { params: { search: projectName, page_size: 100 } });
    const { items } = await res.json();
    for (const p of items.filter((p: { name: string }) => p.name === projectName)) {
      await authedRequest.delete(`/api/projects/${p.id}`);
    }
  });

  test('create a project, run its tests, review the results, and sign out', async ({ page }) => {
    test.setTimeout(90_000);

    await test.step('sign in through the auth modal', async () => {
      const login = new LoginPage(page);
      await login.login(USERNAME, PASSWORD);
      await login.expectLoggedIn();
    });

    let projectId = 0;
    await test.step('create a project and open it from the list', async () => {
      const projects = new ProjectsPage(page);
      await projects.clickNewProject();
      await projects.fillProjectForm(projectName, 'Created by the user-journey spec');
      await projects.submitProjectForm();

      await page.locator('#proj-search').fill(projectName);
      await page.locator('[data-testid^="project-row-"]').filter({ hasText: projectName }).click();
      await page.waitForURL(/#project\/\d+/);
      projectId = Number(page.url().match(/project\/(\d+)/)![1]);
      await expect(page.locator('#view-project h1')).toHaveText(projectName);
    });

    let suiteId = 0;
    await test.step('create a suite and open it', async () => {
      const project = new ProjectPage(page);
      await project.clickNewSuite();
      await project.fillSuiteForm(suiteName);
      await project.submitSuiteForm();

      await project.getSuiteCards().filter({ hasText: suiteName }).click();
      await page.waitForURL(/#suite\/\d+$/);
      suiteId = Number(page.url().match(/suite\/(\d+)/)![1]);
    });

    const cases = ['Pay with saved card', 'Apply discount code', 'Ship to new address'];
    await test.step('add three test cases', async () => {
      const suite = new SuitePage(page);
      for (const title of cases) {
        await suite.clickNewTestCase();
        await suite.fillTestCaseForm({ title, priority: 'high' });
        await suite.submitTestCaseForm();
        await expect(suite.getTestCaseRows().filter({ hasText: title })).toBeVisible();
      }
      await expect(suite.getTestCaseRows()).toHaveCount(cases.length);
    });

    let runId = 0;
    await test.step('start a run and record a pass, a fail with notes, and a skip', async () => {
      runId = await new SuitePage(page).startRun(`Release ${uid}`);
      expect(runId).toBeGreaterThan(0);

      const run = new RunPage(page);
      await run.markResult(cases[0], 'pass');
      await run.markResult(cases[1], 'fail', 'Discount not applied to sale items');
      await run.markResult(cases[2], 'skip');

      await expect(page.locator('#view-run')).toContainText('"Discount not applied to sale items"');
      await expect(page.locator('#view-run h1 + span')).toHaveText('Completed');
      expect(await run.getSummary()).toEqual({ pass: 1, fail: 1, skip: 1, pending: 0 });
    });

    await test.step("the run appears in the suite's run history, opened from the sidebar", async () => {
      await page.locator('#sidebar-projects').getByRole('button', { name: 'Test Runs' }).click();
      await page.waitForURL(new RegExp(`#suite/${suiteId}/runs$`));
      await expect(page.locator('#view-suite h1, #main-content h1').filter({ hasText: 'Test Runs' })).toBeVisible();

      const card = page.getByTestId(`run-card-${runId}`);
      await expect(card).toContainText(`Release ${uid}`);
      await expect(card).toContainText('Completed');
      await card.click();
      await page.waitForURL(new RegExp(`#run/${runId}$`));
    });

    await test.step('project analytics reflects the completed run', async () => {
      await page.getByTestId('breadcrumb').getByRole('button', { name: projectName }).click();
      await page.waitForURL(new RegExp(`#project/${projectId}$`));
      await page.getByRole('button', { name: 'Analytics' }).click();

      const analytics = page.locator('#view-analytics');
      await expect(analytics.getByRole('heading', { name: 'Analytics' })).toBeVisible();
      const row = analytics.locator('tbody tr').filter({ hasText: `Release ${uid}` });
      // Pass / Fail / Skip / Pass Rate — 1 of 3 passed (the API rounds to one decimal).
      await expect(row.locator('td')).toHaveText([`Release ${uid}`, '1', '1', '1', '33.3%']);
      await expect(analytics).toContainText(`${suiteName}`);
      await expect(analytics).toContainText('3/3 active (100%)');
    });

    await test.step('breadcrumb returns to the projects list', async () => {
      await page.getByTestId('breadcrumb').getByRole('button', { name: 'Projects' }).click();
      await page.waitForURL(/#projects$/);
      await expect(page.locator('[data-testid^="project-row-"]').filter({ hasText: projectName })).toBeVisible();
    });

    await test.step('sign out', async () => {
      page.once('dialog', d => d.accept());
      await page.getByTestId('logout-btn').click();
      await expect(page.getByTestId('signin-btn')).toBeVisible();
      await expect(page.getByTestId('logout-btn')).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('tf_token'))).toBeNull();
    });
  });
});
