import { test, expect } from '../fixtures/test';
import { E2E_NAME_PREFIX, aProject, aSuite, uniqueName } from '../data/builders';
import { createProjectViaUi, seedRunWithResult, seedTestCases } from '../flows/workflows';

test.describe('Projects', () => {
  test('renders the empty state or the project list on first load', async ({ app }) => {
    await test.step('Open the projects page', async () => {
      await app.projects.goto();
    });

    await test.step('Exactly one of: "no projects yet" or the searchable list', async () => {
      // The suite shares one backend, so whether this user has projects
      // depends on what else ran — but one of the two must render.
      await expect(app.projects.emptyState.or(app.projects.searchInput)).toBeVisible();
      await expect(app.page).not.toHaveTitle(/error|404|500/i);
    });
  });

  test('can create a project', async ({ app, api }) => {
    const input = aProject({ description: 'Created by e2e test' });

    await test.step('Create the project through the New Project form', async () => {
      await createProjectViaUi(app, input);
    });

    await test.step('It appears in the list', async () => {
      // Filtered to this project: parallel specs add newer projects that can
      // push it off the first page.
      await app.projects.search(input.name);
      await expect(app.projects.projectRow(input.name)).toBeVisible({ timeout: 10000 });
    });

    await test.step('It was persisted with the description entered', async () => {
      const created = await api.projects.adoptByName(input.name);
      expect(created.description).toBe(input.description);
    });
  });

  test('can delete a project', async ({ app, api }) => {
    const project = await api.projects.create(aProject({ name: uniqueName('Delete Me') }));

    await test.step('Delete it from the projects list', async () => {
      await app.projects.goto();
      await app.projects.deleteProject(project.name);
    });

    await test.step('It is gone from the list and from the backend', async () => {
      await expect(app.projects.projectRow(project.name)).toHaveCount(0, { timeout: 5000 });
      expect((await api.projects.search(project.name)).items).toHaveLength(0);
    });
  });

  test('paginates the projects list at 5 rows per page', async ({ app, api }) => {
    const base = uniqueName(`${E2E_NAME_PREFIX}Page`);
    const names = Array.from({ length: 6 }, (_, i) => `${base}_${i + 1}`);

    await test.step('Seed 6 projects (sequentially, so ordering is deterministic)', async () => {
      for (const name of names) await api.projects.create(aProject({ name }));
    });

    await test.step('Open the list filtered to these 6', async () => {
      await app.projects.goto();
      // Other specs add projects in parallel; filtering keeps the page
      // deterministic (the search resets to page 1).
      await app.projects.search(base);
    });

    await test.step('Page 1 shows 5 rows, newest first, without the oldest', async () => {
      await expect(app.projects.projectRow(names[5])).toBeVisible({ timeout: 10000 });
      await expect(app.projects.getProjectCards()).toHaveCount(5);
      await expect(app.projects.projectRow(names[0])).toHaveCount(0);
    });

    await test.step('Next reveals the oldest of the 6', async () => {
      await app.projects.nextPage();
      await expect(app.projects.projectRow(names[0])).toBeVisible({ timeout: 5000 });
    });

    await test.step('Previous returns to the first page', async () => {
      await app.projects.previousPage();
      await expect(app.projects.projectRow(names[5])).toBeVisible({ timeout: 5000 });
    });
  });

  test('project stats count its suites, test cases and runs', async ({ app, api, project }) => {
    await test.step('Seed one suite with two cases and one run', async () => {
      const suite = await api.suites.create(project.id, aSuite());
      const [first] = await seedTestCases(api, suite.id, ['Stats TC 1', 'Stats TC 2']);
      await seedRunWithResult(api, suite.id, first, 'pass');
    });

    await test.step('Open the project', async () => {
      await app.project.goto(project.id);
      await expect(app.page).not.toHaveTitle(/error|404|500/i);
    });

    await test.step('Stat tiles reflect what was seeded', async () => {
      await expect(app.project.stat('suites')).toHaveText('1');
      await expect(app.project.stat('cases')).toHaveText('2');
      await expect(app.project.stat('runs')).toHaveText('1');
    });
  });
});
