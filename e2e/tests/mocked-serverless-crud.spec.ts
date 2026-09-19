import { test, expect } from '@playwright/test';
import { ProjectsPage } from '../pages/projects.page';
import { ProjectPage } from '../pages/project.page';
import { SuitePage } from '../pages/suite.page';
import { mockProject, mockProjectList, mockSuite, mockTestCase } from '../mocks/factories';
import { fulfillJson, mockAuthSession, byPath } from '../mocks/route-helpers';

/**
 * Fully serverless (mocked) core-CRUD coverage — see e2e/README.md's
 * "Serverless mocked E2E tests" section. Runs under playwright.mocked.config.ts
 * against a plain static file server, every API call intercepted via
 * page.route() (e2e/mocks/). Response shapes are kept honest by
 * e2e/tests/mock-contract-drift.spec.ts, which runs separately against a
 * real backend.
 */

test.describe('Projects list — serverless', () => {
  test('lists projects returned by the mocked API', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Serverless Demo Project' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));

    const projectsPage = new ProjectsPage(page);
    await projectsPage.goto();

    await expect(projectsPage.getProjectCards().filter({ hasText: 'Serverless Demo Project' })).toBeVisible();
  });

  test('creating a project posts the form and shows the mocked response', async ({ page }) => {
    await mockAuthSession(page);
    let created = false;
    await page.route(byPath('/api/projects'), async (route) => {
      if (route.request().method() === 'POST') {
        created = true;
        await fulfillJson(route, 201, mockProject({ name: 'New Mocked Project' }));
        return;
      }
      const items = created ? [mockProject({ name: 'New Mocked Project' })] : [];
      await fulfillJson(route, 200, mockProjectList(items));
    });

    const projectsPage = new ProjectsPage(page);
    await projectsPage.goto();
    await projectsPage.clickNewProject();
    await projectsPage.fillProjectForm('New Mocked Project', 'created against a mocked backend');
    await projectsPage.submitProjectForm();

    expect(created).toBeTruthy();
  });

  test('deleting a project calls DELETE and the row disappears from the mocked list', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Doomed Project' });
    let deleted = false;
    await page.route(byPath('/api/projects'), (route) =>
      fulfillJson(route, 200, mockProjectList(deleted ? [] : [project])),
    );
    await page.route(byPath(`/api/projects/${project.id}`), async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        await fulfillJson(route, 204, {});
        return;
      }
      await route.continue();
    });

    const projectsPage = new ProjectsPage(page);
    await projectsPage.goto();
    await expect(projectsPage.getProjectCards().filter({ hasText: 'Doomed Project' })).toBeVisible();
    await projectsPage.deleteProject('Doomed Project');

    expect(deleted).toBeTruthy();
    await expect(projectsPage.getProjectCards().filter({ hasText: 'Doomed Project' })).toHaveCount(0);
  });
});

// renderProject/renderSuite in static/app.js have no per-ID GET endpoint to
// call: they fetch the full /api/projects list (and, for a suite, every
// project's /api/projects/{id}/suites too) and find the target client-side.
// See e2e/README.md's "Serverless mocked E2E tests" section for why the
// mocks below mirror that rather than a REST-ish per-ID shape.

test.describe('Project detail — suites — serverless', () => {
  test('shows suites returned by the mocked API for a project', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Suite Parent' });
    const suite = mockSuite({ project_id: project.id, name: 'Regression Suite' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/projects/${project.id}/stats`), (route) =>
      fulfillJson(route, 200, { total_suites: 1, total_cases: 0, total_runs: 0 }),
    );

    const projectPage = new ProjectPage(page);
    await projectPage.goto(project.id);

    await expect(projectPage.getSuiteCards().filter({ hasText: 'Regression Suite' })).toBeVisible();
  });

  test('creating a suite posts the form and reflects in the mocked list', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Suite Parent' });
    let created = false;
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/stats`), (route) =>
      fulfillJson(route, 200, { total_suites: created ? 1 : 0, total_cases: 0, total_runs: 0 }),
    );
    await page.route(byPath(`/api/projects/${project.id}/suites`), async (route) => {
      if (route.request().method() === 'POST') {
        created = true;
        await fulfillJson(route, 201, mockSuite({ project_id: project.id, name: 'Fresh Suite' }));
        return;
      }
      await fulfillJson(route, 200, created ? [mockSuite({ project_id: project.id, name: 'Fresh Suite' })] : []);
    });

    const projectPage = new ProjectPage(page);
    await projectPage.goto(project.id);
    await projectPage.clickNewSuite();
    await projectPage.fillSuiteForm('Fresh Suite', 'created against a mocked backend');
    await projectPage.submitSuiteForm();

    expect(created).toBeTruthy();
  });
});

test.describe('Suite detail — test cases — serverless', () => {
  test('lists test cases returned by the mocked API for a suite', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Case Grandparent' });
    const suite = mockSuite({ project_id: project.id, name: 'Case Parent' });
    const testCase = mockTestCase({ suite_id: suite.id, title: 'Login with valid credentials' });
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, [testCase]));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));

    const suitePage = new SuitePage(page);
    await suitePage.goto(suite.id);

    await expect(suitePage.getTestCaseRows().filter({ hasText: 'Login with valid credentials' })).toBeVisible();
  });

  test('creating a test case posts the form and reflects in the mocked list', async ({ page }) => {
    await mockAuthSession(page);
    const project = mockProject({ name: 'Case Grandparent' });
    const suite = mockSuite({ project_id: project.id, name: 'Case Parent' });
    let created = false;
    await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
    await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
    await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));
    await page.route(byPath(`/api/suites/${suite.id}/testcases`), async (route) => {
      if (route.request().method() === 'POST') {
        created = true;
        await fulfillJson(route, 201, mockTestCase({ suite_id: suite.id, title: 'New mocked case' }));
        return;
      }
      await fulfillJson(route, 200, created ? [mockTestCase({ suite_id: suite.id, title: 'New mocked case' })] : []);
    });

    const suitePage = new SuitePage(page);
    await suitePage.goto(suite.id);
    await suitePage.clickNewTestCase();
    await suitePage.fillTestCaseForm({
      title: 'New mocked case',
      steps: '1. Do the thing',
      expected: 'It works',
      priority: 'high',
    });
    await suitePage.submitTestCaseForm();

    expect(created).toBeTruthy();
  });
});
