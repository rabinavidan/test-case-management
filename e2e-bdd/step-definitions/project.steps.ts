import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { TestFlowWorld } from './world';
import { ensureAuthenticated } from './hooks';

function uniqueName(base: string): string {
  return `${base}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

Given('I am signed in to TestFlow', async function (this: TestFlowWorld) {
  await ensureAuthenticated(this);
  await this.projectsPage.goto();
});

When('I create a new project named {string}', async function (this: TestFlowWorld, name: string) {
  const actualName = uniqueName(name);
  this.projectNames.set(name, actualName);

  await this.projectsPage.clickNewProject();
  await this.projectsPage.fillProjectForm(actualName, 'Created by the Cucumber BDD suite');
  await this.projectsPage.submitProjectForm();
});

Then('a project named {string} appears in the projects list', async function (this: TestFlowWorld, name: string) {
  const actualName = this.projectNames.get(name) ?? name;
  await expect(this.page.getByText(actualName).first()).toBeVisible({ timeout: 10_000 });

  const res = await this.request.get('/api/projects', {
    headers: { Authorization: `Bearer ${this.authToken}` },
  });
  const { items }: { items: Array<{ id: number; name: string }> } = await res.json();
  const created = items.find((p) => p.name === actualName);
  if (created) this.createdProjectIds.push(created.id);
});

Given('a project named {string} already exists', async function (this: TestFlowWorld, name: string) {
  const actualName = uniqueName(name);
  this.projectNames.set(name, actualName);

  const res = await this.request.post('/api/projects', {
    data: { name: actualName, description: 'Seeded by the Cucumber BDD suite' },
    headers: { Authorization: `Bearer ${this.authToken}` },
  });
  const body = await res.json();
  const id = body.id || body.data?.id;
  this.createdProjectIds.push(id);
  await this.projectsPage.goto();
});

When('I delete the project named {string}', async function (this: TestFlowWorld, name: string) {
  const actualName = this.projectNames.get(name) ?? name;
  await this.projectsPage.deleteProject(actualName);
});

Then(
  'a project named {string} no longer appears in the projects list',
  async function (this: TestFlowWorld, name: string) {
    const actualName = this.projectNames.get(name) ?? name;
    await expect(this.page.getByText(actualName).first()).not.toBeVisible({ timeout: 5_000 });
  },
);
