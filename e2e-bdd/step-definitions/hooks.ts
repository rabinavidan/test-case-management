import { Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, Browser, request as pwRequest } from '@playwright/test';
import { TestFlowWorld } from './world';
import { LoginPage } from '../pages/login.page';
import { ProjectsPage } from '../pages/projects.page';

setDefaultTimeout(30_000);

export const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
export const USERNAME = 'testuser_e2e';
export const PASSWORD = 'Test@12345';

let sharedBrowser: Browser;

BeforeAll(async function () {
  // Allows pointing at a pre-installed browser binary in locked-down/offline
  // CI sandboxes where `npx playwright install` can't reach the CDN.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  sharedBrowser = await chromium.launch({ executablePath });

  // Register the shared user once, up front — some scenarios (e.g. "valid
  // credentials logs the user in") sign in through the UI directly and
  // can't rely on scenario ordering to have registered it first.
  const setup = await pwRequest.newContext({ baseURL: BASE_URL });
  await setup
    .post('/api/auth/register', { data: { username: USERNAME, password: PASSWORD, email: 'e2e-bdd@test.com' } })
    .catch(() => {});
  await setup.dispose();
});

AfterAll(async function () {
  await sharedBrowser.close();
});

Before(async function (this: TestFlowWorld) {
  this.browser = sharedBrowser;
  this.context = await sharedBrowser.newContext({ baseURL: BASE_URL });
  this.page = await this.context.newPage();
  this.request = await pwRequest.newContext({ baseURL: BASE_URL });
  this.loginPage = new LoginPage(this.page);
  this.projectsPage = new ProjectsPage(this.page);
});

After(async function (this: TestFlowWorld) {
  for (const id of this.createdProjectIds.splice(0)) {
    await this.request
      .delete(`/api/projects/${id}`, {
        headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : undefined,
      })
      .catch(() => {});
  }
  await this.request.dispose();
  await this.context.close();
});

/** Registers (idempotently) and logs in the shared e2e test user, seeding the page's auth token. */
export async function ensureAuthenticated(world: TestFlowWorld): Promise<void> {
  if (world.authToken) return;

  await world.request
    .post('/api/auth/register', {
      data: { username: USERNAME, password: PASSWORD, email: 'e2e-bdd@test.com' },
    })
    .catch(() => {});

  const res = await world.request.post('/api/auth/login', {
    data: { username: USERNAME, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`BDD login failed: ${res.status()} ${await res.text()}`);
  }

  const body = await res.json();
  world.authToken = body.access_token || body.token || body.data?.token;
  await world.page.addInitScript(
    (token) => window.localStorage.setItem('tf_token', token as string),
    world.authToken,
  );
}
