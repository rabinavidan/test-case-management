import { test, expect } from '../fixtures/test';
import { aRun } from '../data/builders';
import { executeRunViaUi, seedTestCases } from '../flows/workflows';

const ALPHA = 'TC-Alpha';
const BETA = 'TC-Beta';

test.describe('Test Runs', () => {
  // Every test gets its own project → suite → two active cases. The fixtures
  // are test-scoped, so beforeEach and the test share the same seededSuite.
  test.beforeEach(async ({ api, seededSuite }) => {
    await seedTestCases(api, seededSuite.suite.id, [ALPHA, BETA]);
  });

  test('can start a test run from a suite', async ({ app, seededSuite }) => {
    await app.suite.goto(seededSuite.suite.id);
    const runId = await app.suite.startRun(aRun().name);

    expect(runId).toBeGreaterThan(0);
    await expect(app.page).toHaveURL(new RegExp(`run/${runId}`));
    await expect(app.run.summaryCount('pending')).toHaveText('2');
  });

  test('can mark test cases as pass and fail', async ({ app, seededSuite }) => {
    await executeRunViaUi(app, seededSuite.suite.id, { [ALPHA]: 'pass', [BETA]: 'fail' });

    await expect(app.run.summaryCount('pass')).toHaveText('1');
    await expect(app.run.summaryCount('fail')).toHaveText('1');
    await expect(app.run.summaryCount('pending')).toHaveText('0');
  });

  test('run summary shows correct counts after all results', async ({ app, seededSuite }) => {
    await executeRunViaUi(app, seededSuite.suite.id, {
      [ALPHA]: { status: 'pass', notes: 'All good' },
      [BETA]: { status: 'skip', notes: 'N/A' },
    });

    await expect(app.run.summaryCount('pass')).toHaveText('1');
    await expect(app.run.summaryCount('skip')).toHaveText('1');
    await expect(app.run.summaryCount('pending')).toHaveText('0');
  });

  test('all-pass run has no failures or pending', async ({ app, seededSuite }) => {
    await executeRunViaUi(app, seededSuite.suite.id, { [ALPHA]: 'pass', [BETA]: 'pass' });

    await expect(app.run.summaryCount('pass')).toHaveText('2');
    await expect(app.run.summaryCount('fail')).toHaveText('0');
    await expect(app.run.summaryCount('pending')).toHaveText('0');
  });
});
