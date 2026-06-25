import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { SuitePage } from '../pages/suite.page';

function getAuthToken(): string {
  const authStatePath = path.join(__dirname, '..', 'auth-state.json');
  const { token } = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
  return token;
}

function uniqueName(base: string): string {
  return `${base}_${Date.now()}`;
}

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
    projectId = proj.id || proj.data?.id;

    const suiteRes = await request.post(`/api/projects/${projectId}/suites`, {
      data: { name: uniqueName('TC Suite'), description: 'For test cases' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const suite = await suiteRes.json();
    suiteId = suite.id || suite.data?.id;
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
      localStorage.setItem('token', token);
      localStorage.setItem('authToken', token);
      sessionStorage.setItem('token', token);
    }, authToken);
  });

  test('can create a test case with all fields', async ({ page }) => {
    const title = uniqueName('Full Test Case');
    const suitePage = new SuitePage(page);

    await test.step('Navigate to suite', async () => {
      await suitePage.goto(suiteId);
    });

    await test.step('Open new test case form', async () => {
      await suitePage.clickNewTestCase();
    });

    await test.step('Fill all test case fields', async () => {
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
      await suitePage.submitTestCaseForm();
      await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    });
  });

  test('test case appears with correct priority badge', async ({ page }) => {
    const title = uniqueName('Critical Test');
    const suitePage = new SuitePage(page);

    await test.step('Create test case with critical priority', async () => {
      await suitePage.goto(suiteId);
      await suitePage.clickNewTestCase();
      await suitePage.fillTestCaseForm({ title, priority: 'critical' });
      await suitePage.submitTestCaseForm();
    });

    await test.step('Verify critical badge is visible', async () => {
      const row = page.locator('tr, .testcase-row, [data-testid="testcase-row"]').filter({ hasText: title });
      const badge = row.getByText(/critical/i);
      await expect(badge).toBeVisible({ timeout: 5000 });
    });
  });

  test('can edit a test case', async ({ page, request }) => {
    const originalTitle = uniqueName('Editable TC');
    const updatedTitle = uniqueName('Updated TC');
    let tcId: number;

    await test.step('Create test case via API', async () => {
      const res = await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title: originalTitle, description: 'Original description', priority: 'low' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const body = await res.json();
      tcId = body.id || body.data?.id;
    });

    const suitePage = new SuitePage(page);

    await test.step('Navigate to suite and find the test case', async () => {
      await suitePage.goto(suiteId);
      await expect(page.getByText(originalTitle)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Click edit and update title', async () => {
      const row = page.locator('tr, .testcase-row, [data-testid="testcase-row"]').filter({ hasText: originalTitle });
      await row.getByRole('button', { name: /edit/i }).click();

      const titleInput = page.getByLabel(/title|name/i);
      await titleInput.clear();
      await titleInput.fill(updatedTitle);

      await page.getByRole('button', { name: /save|update|submit/i }).click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify updated title is shown', async () => {
      await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 10000 });
    });
  });

  test('can delete a test case', async ({ page, request }) => {
    const title = uniqueName('Delete TC');

    await test.step('Create test case via API', async () => {
      await request.post(`/api/suites/${suiteId}/testcases`, {
        data: { title, description: 'To be deleted', priority: 'medium' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
    });

    const suitePage = new SuitePage(page);

    await test.step('Navigate to suite', async () => {
      await suitePage.goto(suiteId);
      await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    });

    await test.step('Delete the test case', async () => {
      const row = page.locator('tr, .testcase-row, [data-testid="testcase-row"]').filter({ hasText: title });
      await row.getByRole('button', { name: /delete/i }).click();

      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i });
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify test case is gone', async () => {
      await expect(page.getByText(title)).not.toBeVisible({ timeout: 5000 });
    });
  });
});
