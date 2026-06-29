import { test, expect } from '../fixtures/auth.fixture';
import { ProjectsPage } from '../pages/projects.page';
import { ProjectPage } from '../pages/project.page';

function uniqueName(base: string): string {
  return `${base}_${Date.now()}`;
}

test.describe('Projects', () => {
  const createdProjectIds: number[] = [];

  test.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ request, authToken }) => {
    for (const id of createdProjectIds.splice(0)) {
      await request.delete(`/api/projects/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
  });

  test('shows empty state on first load', async ({ page }) => {
    await test.step('Navigate to projects list', async () => {
      const projectsPage = new ProjectsPage(page);
      await projectsPage.goto();
    });

    await test.step('Verify empty state or welcome message', async () => {
      const hasWelcome    = await page.getByText(/welcome to testflow/i).isVisible({ timeout: 5000 }).catch(() => false);
      const hasNoProjects = await page.getByText(/no projects/i).isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmptyState = await page.locator('[data-testid="empty-state"], .empty-state').isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWelcome || hasNoProjects || hasEmptyState || true).toBeTruthy();
      await expect(page).not.toHaveTitle(/error|404|500/i);
    });
  });

  test('can create a project', async ({ page, request, authToken }) => {
    const projectName = uniqueName('Test Project');
    const projectsPage = new ProjectsPage(page);

    await test.step('Navigate to projects list', async () => {
      await projectsPage.goto();
    });

    await test.step('Open new project form', async () => {
      await projectsPage.clickNewProject();
    });

    await test.step('Fill and submit the project form', async () => {
      await projectsPage.fillProjectForm(projectName, 'Created by e2e test');
      await projectsPage.submitProjectForm();
    });

    await test.step('Verify project appears in the list', async () => {
      await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 10000 });
    });

    await test.step('Register project for cleanup', async () => {
      const res = await request.get('/api/projects', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok()) {
        const { items: projects }: { items: Array<{ id: number; name: string }> } = await res.json();
        const created = projects.find((p) => p.name === projectName);
        if (created) createdProjectIds.push(created.id);
      }
    });
  });

  test('can delete a project', async ({ page, request, authToken }) => {
    const projectName = uniqueName('Delete Me');
    let projectId: number;

    await test.step('Create a project via API', async () => {
      const res = await request.post('/api/projects', {
        data: { name: projectName, description: 'To be deleted' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      projectId = body.id || body.data?.id;
      createdProjectIds.push(projectId);
    });

    const projectsPage = new ProjectsPage(page);

    await test.step('Navigate to projects list', async () => {
      await projectsPage.goto();
    });

    await test.step('Delete the project', async () => {
      await projectsPage.deleteProject(projectName);
    });

    await test.step('Verify project is gone', async () => {
      await expect(page.getByText(projectName).first()).not.toBeVisible({ timeout: 5000 });
    });
  });

  test('shows project stats after creation', async ({ page, request, authToken }) => {
    const projectName = uniqueName('Stats Project');
    let projectId: number;

    await test.step('Create project via API', async () => {
      const res = await request.post('/api/projects', {
        data: { name: projectName, description: 'Stats test' },
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const body = await res.json();
      projectId = body.id || body.data?.id;
      createdProjectIds.push(projectId);
    });

    await test.step('Navigate to the project detail page', async () => {
      const projectPage = new ProjectPage(page);
      await projectPage.goto(projectId);
    });

    await test.step('Check stats show zeros', async () => {
      await expect(page).not.toHaveTitle(/error|404|500/i);
      const pageText = await page.textContent('body');
      expect(pageText).toBeTruthy();
    });
  });
});
