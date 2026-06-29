import { test, expect } from '../fixtures/auth.fixture';
import * as fs from 'fs';
import * as path from 'path';
import { SuitePage } from '../pages/suite.page';
import { log } from '../logger';

function getAuthToken(): string {
  const authStatePath = path.join(__dirname, '..', 'auth-state.json');
  const { token } = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
  return token;
}

function uniqueName(base: string): string {
  return `${base}_${Date.now()}`;
}

// Test cases render as cards: data-testid="testcase-card-{id}"
// Edit button:   data-testid="edit-testcase-{id}"   title="Edit"  (no visible text)
// Delete button: data-testid="delete-testcase-{id}" title="Delete" (no visible text)

test.describe('Test Cases', () => {
  let authToken: string;
  let projectId: number;
  let suiteId: number;

  test.beforeAll(async ({ request }) => {
    authToken = getAuthToken();

    const projRes = await request.post('/api/projects', {
      data: { name: uniqueName('TC Project'), description: 'For test case tests' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const proj = await projRes.json();
    projectId = proj.id;

    const suiteRes = await request.post(`/api/projects/${projectId}/suites`, {
      data: { name: uniqueName('TC Suite'), description: 'For test cases' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    suiteId = (await suiteRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('tf_token', token);
    }, authToken);
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('can create a test case with all fields', async ({ page }) => {
    const title = uniqueName('Full Test Case');
    const suitePage = new SuitePage(page);
    log.section('can create a test case with all fields');

    await test.step('Navigate to suite', async () => {
      log.step('Navigate to suite');
      await suitePage.goto(suiteId);
    });

    await test.step('Open new test case form', async () => {
      log.step('Open new test case form');
      await suitePage.clickNewTestCase();
    });

    await test.step('Fill all test case fields', async () => {
      log.step('Fill all test case fields');
      await suitePage.fillTestCaseForm({
        title,
        description: 'This test verifies the login flow',
        steps: '1. Open browser\n2. Navigate to login\n3. Enter credentials',
        expected: 'User is logged in successfully',
        priority: 'high',
        status: 'active',
      });
    });

    await test.step('Submit and verify', async () => {
      log.step('Submit and verify');
      await suitePage.submitTestCaseForm();
      await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
      log.assert('test case visible after creation', title);
    });
  });

  test('test case appears with correct priority badge', async ({ page }) => {
    const title = uniqueName('Critical Test');
    const suitePage = new SuitePage(page);
    log.section('test case appears with correct priority badge');

    await test.step('Create test case with critical priority', async () => {
      log.step('Create critical test case');
      await suitePage.goto(suiteId);
      await suitePage.clickNewTestCase();
      await suitePage.fillTestCaseForm({ title, priority: 'critical' });
      await suitePage.submitTestCaseForm();
    });

    await test.step('Verify critical badge is visible', async () => {
      log.step('Verify critical badge');
      // Cards use data-testid="testcase-card-{id}"; find by title text then check for badge
      const card = page.locator('[data-testid^="testcase-card-"]').filter({ hasText: title });
      const badge = card.getByText('critical', { exact: true });
      await expect(badge).toBeVisible({ timeout: 5000 });
      log.assert('critical badge visible on card');
    });
  });

  test('can edit a test case', async ({ page, request }) => {
    const originalTitle = uniqueName('Editable TC');
    const updatedTitle  = `Updated_${Date.now()}`;
    let tcId: number;
    log.section('can edit a test case');

    await test.step('Create test case via API', async () => {
      log.step('Create test case via API');
      const res = await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title: originalTitle, description: 'Original description', priority: 'low', status: 'active' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      tcId = (await res.json()).id;
      log.info(`Created TC id=${tcId}`);
    });

    const suitePage = new SuitePage(page);

    await test.step('Navigate to suite and find the test case', async () => {
      log.step('Navigate to suite');
      await suitePage.goto(suiteId);
      await expect(page.getByText(originalTitle)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Click edit button and update title', async () => {
      log.step('Click edit button');
      // Edit button has data-testid="edit-testcase-{id}" with no visible text
      await page.locator(`[data-testid="edit-testcase-${tcId}"]`).click();

      log.step('Update title in edit modal');
      const titleInput = page.locator('#f-title');
      await titleInput.clear();
      await titleInput.fill(updatedTitle);

      log.action('click', 'Save Changes button');
      await page.getByRole('button', { name: /save changes/i }).click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify updated title is shown', async () => {
      log.step('Verify updated title');
      await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 10000 });
      log.assert('updated title visible', updatedTitle);
    });
  });

  test('can delete a test case', async ({ page, request }) => {
    const title = uniqueName('Delete TC');
    let tcId: number;
    log.section('can delete a test case');

    await test.step('Create test case via API', async () => {
      log.step('Create test case via API');
      const res = await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title, description: 'To be deleted', priority: 'medium', status: 'active' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      tcId = (await res.json()).id;
    });

    const suitePage = new SuitePage(page);

    await test.step('Navigate to suite', async () => {
      log.step('Navigate to suite');
      await suitePage.goto(suiteId);
      await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Delete the test case', async () => {
      log.step('Click delete button');
      page.once('dialog', d => d.accept());
      await page.locator(`[data-testid="delete-testcase-${tcId}"]`).click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify test case is gone', async () => {
      log.step('Verify test case removed');
      await expect(page.getByText(title)).not.toBeVisible({ timeout: 5000 });
      log.assert('test case no longer visible');
    });
  });
});
