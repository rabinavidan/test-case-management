import { test, expect } from '../fixtures/test';
import { anActiveTestCase, uniqueName } from '../data/builders';
import { createTestCaseViaUi } from '../flows/workflows';

test.describe('Test Cases', () => {
  test('can create a test case with all fields', async ({ app, seededSuite }) => {
    const input = anActiveTestCase({
      title: uniqueName('Full Test Case'),
      description: 'This test verifies the login flow',
      steps: '1. Open browser\n2. Navigate to login\n3. Enter credentials',
      expected: 'User is logged in successfully',
      priority: 'high',
    });

    await test.step('Create it through the New Test Case form', async () => {
      await createTestCaseViaUi(app, seededSuite.suite.id, input);
    });

    await test.step('It is listed on the suite with its priority', async () => {
      await expect(app.suite.testCaseCard(input.title)).toBeVisible({ timeout: 10000 });
      await expect(app.suite.priorityBadge(input.title, 'high')).toBeVisible();
    });
  });

  test('test case appears with correct priority badge', async ({ app, seededSuite }) => {
    const input = { title: uniqueName('Critical Test'), priority: 'critical' as const };

    await test.step('Create a critical test case', async () => {
      await createTestCaseViaUi(app, seededSuite.suite.id, input);
    });

    await test.step('Its card shows the critical badge', async () => {
      await expect(app.suite.priorityBadge(input.title, 'critical')).toBeVisible({ timeout: 5000 });
    });
  });

  test('can edit a test case', async ({ app, api, seededSuite }) => {
    const { suite } = seededSuite;
    const testCase = await api.testCases.create(
      suite.id,
      anActiveTestCase({ title: uniqueName('Editable TC'), description: 'Original description', priority: 'low' }),
    );
    const updatedTitle = uniqueName('Updated');

    await test.step('Open the suite', async () => {
      await app.suite.goto(suite.id);
      await expect(app.suite.testCaseCard(testCase.title)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Rename it through the edit dialog', async () => {
      await app.suite.renameTestCase(testCase.id, updatedTitle);
    });

    await test.step('The card shows the new title, not the old one', async () => {
      await expect(app.suite.testCaseCard(updatedTitle)).toBeVisible({ timeout: 10000 });
      await expect(app.suite.testCaseCard(testCase.title)).toHaveCount(0);
    });
  });

  test('can delete a test case', async ({ app, api, seededSuite }) => {
    const { suite } = seededSuite;
    const testCase = await api.testCases.create(suite.id, anActiveTestCase({ title: uniqueName('Delete TC') }));

    await test.step('Open the suite', async () => {
      await app.suite.goto(suite.id);
      await expect(app.suite.testCaseCard(testCase.title)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Delete it', async () => {
      await app.suite.deleteTestCase(testCase.id);
    });

    await test.step('It is gone from the suite', async () => {
      await expect(app.suite.testCaseCard(testCase.title)).toHaveCount(0, { timeout: 5000 });
    });
  });
});
