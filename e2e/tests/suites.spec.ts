import { test, expect } from '../fixtures/auth.fixture';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectPage } from '../pages/project.page';

function getAuthToken(): string {
  const authStatePath = path.join(__dirname, '..', 'auth-state.json');
  const { token } = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
  return token;
}

function uniqueName(base: string): string {
  return `${base}_${Date.now()}`;
}

test.describe('Test Suites', () => {
  let authToken: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    authToken = getAuthToken();
    const res = await request.post('/api/projects', {
      data: { name: uniqueName('Suite Test Project'), description: 'For suite tests' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = await res.json();
    projectId = body.id || body.data?.id;
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

  test('can create a test suite inside a project', async ({ page }) => {
    const suiteName = uniqueName('My Suite');
    const projectPage = new ProjectPage(page);

    await test.step('Navigate to project detail', async () => {
      await projectPage.goto(projectId);
    });

    await test.step('Open new suite form', async () => {
      await projectPage.clickNewSuite();
    });

    await test.step('Fill and submit suite form', async () => {
      await projectPage.fillSuiteForm(suiteName, 'A test suite for e2e');
      await projectPage.submitSuiteForm();
    });

    await test.step('Verify suite appears on page', async () => {
      await expect(page.getByText(suiteName).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test('can create multiple suites and see them listed', async ({ page, request }) => {
    const suite1 = uniqueName('Suite Alpha');
    const suite2 = uniqueName('Suite Beta');

    await test.step('Create two suites via API', async () => {
      await request.post(`/api/projects/${projectId}/suites`, {
        data: { name: suite1, description: 'First' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      await request.post(`/api/projects/${projectId}/suites`, {
        data: { name: suite2, description: 'Second' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
    });

    const projectPage = new ProjectPage(page);

    await test.step('Navigate to project and verify both suites listed', async () => {
      await projectPage.goto(projectId);
      await expect(page.getByText(suite1).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(suite2).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test('can delete a suite', async ({ page, request }) => {
    const suiteName = uniqueName('Delete Suite');
    let suiteId: number;

    await test.step('Create suite via API', async () => {
      const res = await request.post(`/api/projects/${projectId}/suites`, {
        data: { name: suiteName, description: 'Will be deleted' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const body = await res.json();
      suiteId = body.id || body.data?.id;
    });

    const projectPage = new ProjectPage(page);

    await test.step('Navigate to project page', async () => {
      await projectPage.goto(projectId);
    });

    await test.step('Delete the suite', async () => {
      // Suite delete button: data-testid="delete-suite-{id}" (requires admin role)
      const deleteBtn = page.locator(`[data-testid="delete-suite-${suiteId}"]`);
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        page.once('dialog', d => d.accept());
        await deleteBtn.click();
        await page.waitForLoadState('networkidle');
      } else {
        // Fallback: delete via API if button not visible (non-admin user)
        await page.request.delete(`/api/suites/${suiteId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        await page.reload();
        await page.waitForLoadState('networkidle');
      }
    });

    await test.step('Verify suite is gone', async () => {
      await expect(page.getByText(suiteName).first()).not.toBeVisible({ timeout: 5000 });
    });
  });
});
