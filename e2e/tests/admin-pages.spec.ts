import { test, expect } from '../fixtures/auth.fixture';
import type { APIRequestContext, Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

// The admin-only pages: User Management and the Log Center. Every user a
// test creates is deleted afterwards - the scheduled run targets production.

const PASSWORD = 'Exec@12345';

async function deleteUsersWithPrefix(api: APIRequestContext, prefix: string) {
  const users: Array<{ id: number; username: string }> = await (await api.get('/api/users')).json();
  for (const u of users.filter((u) => u.username.startsWith(prefix))) await api.delete(`/api/users/${u.id}`);
}

async function createExecutor(api: APIRequestContext, username: string) {
  const res = await api.post('/api/users', { data: { username, email: `${username}@example.com`, password: PASSWORD } });
  expect(res.status()).toBe(201);
  return (await res.json()).id as number;
}

const loginStatus = async (page: Page, username: string, password = PASSWORD) =>
  (await page.request.post('/api/auth/login', { data: { username, password } })).status();

test.describe('User Management', () => {
  let prefix: string;

  test.beforeEach(async ({ page, authToken }, testInfo) => {
    prefix = `exec${Date.now().toString(36)}${testInfo.workerIndex}${testInfo.repeatEachIndex}`;
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test.afterEach(async ({ authedRequest }) => {
    await deleteUsersWithPrefix(authedRequest, prefix);
  });

  const row = (page: Page, username: string) => page.locator('#view-users tbody tr').filter({ hasText: username });

  test('an admin adds an executor, who can sign in but sees no admin controls or pages', async ({ page, browser }) => {
    const username = `${prefix}a`;
    await page.goto('/#users');
    await page.getByRole('button', { name: 'Add Executor' }).click();
    await page.locator('#f-name').fill(username);
    await page.locator('#f-email').fill(`${username}@example.com`);
    await page.locator('#f-password').fill(PASSWORD);
    await page.getByTestId('modal-submit-btn').click();
    await expect(page.getByTestId('toast-inner')).toContainText(`Executor "${username}" created`);
    await expect(row(page, username)).toContainText('Executor');
    await expect(row(page, username)).toContainText('Active');

    // The executor, in their own browser.
    const ctx = await browser.newContext();
    const exec = await ctx.newPage();
    try {
      const login = new LoginPage(exec);
      await login.login(username, PASSWORD);
      await login.expectLoggedIn();
      await expect(exec.getByTestId('environments-btn')).toBeVisible();
      await expect(exec.getByTestId('users-btn')).toHaveCount(0);
      await expect(exec.getByTestId('logs-btn')).toHaveCount(0);
      await expect(exec.getByTestId('new-project-btn')).toBeHidden();
      // The admin pages fall back to the projects list.
      for (const hash of ['#users', '#logs']) {
        await exec.goto(`/${hash}`);
        await expect(exec.locator('#view-users, #view-logs').filter({ hasText: /Log Center|Add Executor/ })).toHaveCount(0);
        await expect(exec.locator('#view-projects')).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test('deactivating an executor blocks sign-in until they are reactivated', async ({ page, authedRequest }) => {
    const username = `${prefix}d`;
    await createExecutor(authedRequest, username);
    await page.goto('/#users');

    page.once('dialog', (d) => d.accept());
    await row(page, username).getByRole('button', { name: `Deactivate ${username}` }).click();
    await expect(row(page, username)).toContainText('Inactive');
    expect(await loginStatus(page, username)).toBe(403);

    // A deactivated user is told why, not given a generic failure.
    const res = await page.request.post('/api/auth/login', { data: { username, password: PASSWORD } });
    expect((await res.json()).detail).toBe('Account is deactivated');

    await page.goto('/#users');
    page.once('dialog', (d) => d.accept());
    await row(page, username).getByRole('button', { name: `Activate ${username}` }).click();
    await expect(row(page, username)).toContainText('Active');
    await expect(row(page, username)).not.toContainText('Inactive');
    expect(await loginStatus(page, username)).toBe(200);
  });

  test('removing an executor deletes the account', async ({ page, authedRequest }) => {
    const username = `${prefix}r`;
    await createExecutor(authedRequest, username);
    await page.goto('/#users');
    page.once('dialog', (d) => {
      expect(d.message()).toBe(`Remove executor "${username}"?`);
      d.accept();
    });
    await row(page, username).getByRole('button', { name: `Remove ${username}` }).click();
    await expect(row(page, username)).toHaveCount(0);
    expect(await loginStatus(page, username)).toBe(401);
  });

  test('dismissing a confirmation changes nothing', async ({ page, authedRequest }) => {
    const username = `${prefix}k`;
    await createExecutor(authedRequest, username);
    await page.goto('/#users');
    page.once('dialog', (d) => d.dismiss());
    await row(page, username).getByRole('button', { name: `Remove ${username}` }).click();
    await expect(row(page, username)).toBeVisible();
    expect(await loginStatus(page, username)).toBe(200);
  });

  test('the add form reports missing fields, a taken username and a short password', async ({ page, authedRequest }) => {
    const taken = `${prefix}t`;
    await createExecutor(authedRequest, taken);
    await page.goto('/#users');
    const toast = page.getByTestId('toast-inner');
    const submit = async (name: string, email: string, password: string) => {
      await page.getByRole('button', { name: 'Add Executor' }).click();
      await page.locator('#f-name').fill(name);
      await page.locator('#f-email').fill(email);
      await page.locator('#f-password').fill(password);
      await page.getByTestId('modal-submit-btn').click();
    };

    await submit('', '', '');
    await expect(toast).toContainText('All fields are required');
    await page.keyboard.press('Escape');
    await submit(taken, `${prefix}x@example.com`, PASSWORD);
    await expect(toast).toContainText('Username already taken');
    await page.keyboard.press('Escape');
    await submit(`${prefix}s`, `${prefix}s@example.com`, '123');
    await expect(toast).toContainText('at least 6 characters');
  });

  test("the row actions can be reached by keyboard and on touch screens, not only on hover", async ({ page, authedRequest }) => {
    const username = `${prefix}f`;
    await createExecutor(authedRequest, username);
    await page.goto('/#users');
    const remove = row(page, username).getByRole('button', { name: `Remove ${username}` });
    await page.mouse.move(0, 0);
    await remove.focus();
    await expect(remove).toHaveCSS('opacity', '1');
  });

  test('the admin account has no deactivate or remove controls', async ({ page }) => {
    await page.goto('/#users');
    const admin = row(page, 'testuser_e2e');
    await expect(admin).toContainText('Admin');
    await expect(admin.getByRole('button')).toHaveCount(0);
  });
});

test.describe('Log Center', () => {
  let tag: string;

  test.beforeEach(async ({ page, authToken }, testInfo) => {
    tag = `logtag${Date.now().toString(36)}${testInfo.workerIndex}${testInfo.repeatEachIndex}`;
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test('a server request and a browser error both show up, findable by search', async ({ page }) => {
    // Server entries record "METHOD path" (no query string), so a unique path:
    // a suite id that doesn't exist, logged as a 404 warning.
    const missingSuite = 900_000_000 + Math.floor(Math.random() * 99_999_999);
    expect((await page.request.get(`/api/suites/${missingSuite}`)).status()).toBe(404);
    await page.request.post('/api/logs/client', { data: { message: `Simulated client error ${tag}`, url: '/#projects' } });

    await page.goto('/#logs');
    const rows = page.locator('[data-testid^="log-row-"]');
    const search = async (text: string) => {
      await page.locator('#log-f-search').fill(text);
      await page.getByRole('button', { name: 'Search' }).click();
    };

    // Each search re-renders the view, search box included, so wait until the
    // list *is* the search result (one row) before typing the next term - the
    // entry can already be on the unfiltered first page, and a render landing
    // mid-typing would put the old term back in the box.
    await search(tag);
    await expect(rows).toHaveCount(1);
    const clientRow = rows.filter({ hasText: `Simulated client error ${tag}` });
    await expect(clientRow).toHaveCount(1);
    await expect(clientRow).toContainText('client');
    await expect(clientRow).toContainText('error');

    await search(String(missingSuite));
    await expect(rows).toHaveCount(1);
    const serverRow = rows.filter({ hasText: `GET /api/suites/${missingSuite}` });
    await expect(serverRow).toHaveCount(1);
    await expect(serverRow).toContainText('server');
    await expect(serverRow).toContainText('warning');
  });

  test('the level and source filters show only matching entries', async ({ page }) => {
    await page.request.post('/api/logs/client', { data: { message: `Another client error ${tag}`, url: '/' } });
    await page.goto('/#logs');

    await page.locator('#log-f-level').selectOption('error');
    await page.locator('#log-f-source').selectOption('client');
    const rows = page.locator('[data-testid^="log-row-"]');
    await expect(rows.first()).toContainText('client');
    const cells = await rows.evaluateAll((trs) => trs.map((tr) => tr.textContent || ''));
    expect(cells.length).toBeGreaterThan(0);
    for (const text of cells) {
      expect(text).toContain('error');
      expect(text).toContain('client');
    }

    await page.locator('#log-f-level').selectOption('info');
    await page.locator('#log-f-source').selectOption('server');
    // Each filter change reloads the table; wait for the new one before reading it.
    await expect(rows.first()).toContainText('server');
    await expect(rows.first()).toContainText('info');
    for (const text of await rows.evaluateAll((trs) => trs.map((tr) => tr.textContent || ''))) {
      expect(text).toContain('info');
      expect(text).toContain('server');
    }
  });

  test('pagination moves between pages of entries', async ({ page }) => {
    for (let i = 0; i < 30; i++) await page.request.get('/api/version'); // more than one page of entries
    await page.goto('/#logs');
    const pager = page.getByTestId('log-pagination');
    await expect(pager).toContainText('Page 1');
    await expect(page.getByTestId('log-prev-btn')).toBeDisabled();
    const firstRow = await page.locator('[data-testid^="log-row-"]').first().getAttribute('data-testid');

    await page.getByTestId('log-next-btn').click();
    await expect(pager).toContainText('Page 2');
    await expect(page.locator('[data-testid^="log-row-"]').first()).not.toHaveAttribute('data-testid', firstRow!);
    await page.getByTestId('log-prev-btn').click();
    await expect(pager).toContainText('Page 1');
  });

  test('a guest cannot read the log', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:8000' });
    expect((await anon.get('/api/logs')).status()).toBe(401);
    await anon.dispose();
  });
});
