import * as fs from 'fs';
import { test, expect } from '../fixtures/test';
import { aSuite } from '../data/builders';
import { createSuiteViaUi, seedRunWithResult, seedTestCases } from '../flows/workflows';

test.describe('Test Suites', () => {
  test('can create a test suite inside a project', async ({ app, project }) => {
    const input = aSuite({ description: 'A test suite for e2e' });

    await test.step('Create the suite through the New Suite form', async () => {
      await createSuiteViaUi(app, project.id, input);
    });

    await test.step('It is listed on the project and counted in its stats', async () => {
      await expect(app.project.suiteCard(input.name)).toBeVisible({ timeout: 10000 });
      await expect(app.project.stat('suites')).toHaveText('1');
    });
  });

  test('can create multiple suites and see them listed', async ({ app, api, project }) => {
    const alpha = aSuite({ name: 'Suite Alpha' });
    const beta = aSuite({ name: 'Suite Beta' });

    await test.step('Seed two suites', async () => {
      await api.suites.create(project.id, alpha);
      await api.suites.create(project.id, beta);
    });

    await test.step('Both are listed on the project, and nothing else', async () => {
      await app.project.goto(project.id);
      await expect(app.project.suiteCard(alpha.name)).toBeVisible({ timeout: 10000 });
      await expect(app.project.suiteCard(beta.name)).toBeVisible({ timeout: 10000 });
      await expect(app.project.getSuiteCards()).toHaveCount(2);
    });
  });

  test('can delete a suite', async ({ app, seededSuite }) => {
    const { project, suite } = seededSuite;

    await test.step('Delete it from the project page', async () => {
      // Through the UI only: the e2e user is an admin, so a missing delete
      // button is a regression to report, not a reason to fall back to the API.
      await app.project.goto(project.id);
      await app.project.deleteSuite(suite.id);
    });

    await test.step('It is gone from the list and from the stats', async () => {
      await expect(app.project.suiteCard(suite.name)).toHaveCount(0, { timeout: 5000 });
      await expect(app.project.stat('suites')).toHaveText('0');
    });
  });

  test('can export suite test cases to CSV including latest run status', async ({ app, api, seededSuite }) => {
    const { suite } = seededSuite;

    await test.step('Seed a test case and a run that passed it', async () => {
      const [testCase] = await seedTestCases(api, suite.id, ['Export TC']);
      await seedRunWithResult(api, suite.id, testCase, 'pass', 'Export Run');
    });

    await test.step('Export CSV downloads the suite with its latest result', async () => {
      await app.suite.goto(suite.id);
      const download = await app.suite.exportCsv();

      // uniqueName() only emits filename-safe characters, so the name is
      // used as-is. How unsafe names are sanitized is a backend rule, covered
      // in tests/api/test_suites.py (test_export_suite_csv_filename_is_sanitized).
      expect(download.suggestedFilename()).toBe(`${suite.name}_export.csv`);

      const content = fs.readFileSync((await download.path())!, 'utf-8');
      expect(content).toContain('Export TC');
      expect(content).toContain('Export Run');
      expect(content).toContain('pass');
    });
  });
});
