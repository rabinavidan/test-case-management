import { test, expect } from '../fixtures/auth.fixture';
import type { APIRequestContext, Page } from '@playwright/test';

// Search, sort and bulk delete on the projects list (the signed-in home page).
// Other specs share this database in parallel, so every test tags its project
// names with a unique id and filters the list down to that tag before
// asserting — the assertions never depend on what else exists.

const rows = (page: Page) => page.locator('[data-testid^="project-row-"]');
const names = (page: Page) => page.locator('[data-testid^="project-name-"]');
const search = (page: Page) => page.locator('#proj-search');

async function createProjects(api: APIRequestContext, specs: Array<{ name: string; description?: string }>) {
  const ids: number[] = [];
  // Sequential, so created_at order matches array order for the sort tests.
  for (const s of specs) {
    const res = await api.post('/api/projects', { data: s });
    expect(res.ok()).toBeTruthy();
    ids.push((await res.json()).id);
  }
  return ids;
}

test.describe('Projects list — signed-in home layout', () => {
  test('the projects list comes before the product walkthrough and architecture showcase', async ({ page, authToken, authedRequest }, testInfo) => {
    // Its own project, so the list renders whatever else the database holds.
    const name = `ListProj_${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex} layout`;
    const { id } = await (await authedRequest.post('/api/projects', { data: { name } })).json();
    try {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/');
    const heading = page.locator('#view-projects h1', { hasText: 'Projects' });
    const walkthrough = page.locator('#view-projects').getByText('How TestFlow works');
    await expect(heading).toBeVisible();
    await expect(walkthrough).toBeAttached();
    const order = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('#view-projects h1')).find((e) => e.textContent?.trim() === 'Projects')!;
      const w = Array.from(document.querySelectorAll('#view-projects p')).find((e) => e.textContent?.trim() === 'How TestFlow works')!;
      const toggle = document.getElementById('showcase-toggle-btn')!;
      const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { walkthroughAfterList: after(h, w), showcaseAfterList: after(h, toggle) };
    });
    expect(order).toEqual({ walkthroughAfterList: true, showcaseAfterList: true });
    } finally {
      await authedRequest.delete(`/api/projects/${id}`);
    }
  });
});

test.describe('Projects list — search, sort, bulk delete', () => {
  let tag: string;

  test.beforeEach(async ({ page, authToken }, testInfo) => {
    tag = `ListProj_${Date.now()}_${testInfo.workerIndex}`;
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test.afterEach(async ({ authedRequest }) => {
    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    for (const p of items.filter((p: { name: string }) => p.name.startsWith(tag))) {
      await authedRequest.delete(`/api/projects/${p.id}`);
    }
  });

  test('search matches name or description, case-insensitively, and reports no matches', async ({ page, authedRequest }) => {
    await createProjects(authedRequest, [
      { name: `${tag} Payments API` },
      { name: `${tag} Mobile App`, description: 'Covers the CHECKOUT flow' },
      { name: `${tag} Admin Portal` },
    ]);
    await page.goto('/');

    await search(page).fill(tag);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('#proj-count-label')).toContainText('3 of');

    await search(page).fill(`${tag} payments`.toUpperCase());
    await expect(names(page)).toHaveText([`${tag} Payments API`]);

    // A description-only match: "checkout" appears in no project name.
    await search(page).fill('covers the checkout');
    await expect(rows(page).filter({ hasText: `${tag} Mobile App` })).toBeVisible();

    await search(page).fill(`${tag} no-such-project`);
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('#proj-empty-filter')).toBeVisible();
    await expect(page.locator('#proj-empty-filter')).toHaveText('No projects match your filter.');

    await search(page).fill('');
    await expect(page.locator('#proj-empty-filter')).toBeHidden();
  });

  test('every sort order is applied to the filtered list', async ({ page, authedRequest }) => {
    // Created in this order, so newest-first is the reverse of it.
    await createProjects(authedRequest, [
      { name: `${tag} Bravo` },
      { name: `${tag} Alpha` },
      { name: `${tag} Charlie` },
    ]);
    await page.goto('/');
    await search(page).fill(tag);

    const sortBy = (v: string) => page.locator('#proj-sort').selectOption(v);
    const order = (...n: string[]) => n.map(x => `${tag} ${x}`);

    await expect(names(page)).toHaveText(order('Charlie', 'Alpha', 'Bravo')); // default: newest
    await sortBy('oldest');
    await expect(names(page)).toHaveText(order('Bravo', 'Alpha', 'Charlie'));
    await sortBy('az');
    await expect(names(page)).toHaveText(order('Alpha', 'Bravo', 'Charlie'));
    await sortBy('za');
    await expect(names(page)).toHaveText(order('Charlie', 'Bravo', 'Alpha'));
  });

  test('select-all on a filtered list bulk-deletes only the visible projects', async ({ page, authedRequest }) => {
    const [keepId] = await createProjects(authedRequest, [
      { name: `${tag} keep` },
      { name: `${tag} drop one` },
      { name: `${tag} drop two` },
    ]);
    await page.goto('/');
    await search(page).fill(`${tag} drop`);
    await expect(rows(page)).toHaveCount(2);

    await page.locator('#proj-select-all').check();
    await expect(page.locator('#bulk-count')).toHaveText('2 selected');

    page.once('dialog', d => {
      expect(d.message()).toContain('Delete 2 projects');
      d.accept();
    });
    await page.getByRole('button', { name: 'Remove Selected' }).click();
    await expect(page.getByTestId('toast-inner')).toHaveText(/2 projects deleted/);

    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    const left = items.filter((p: { name: string }) => p.name.startsWith(tag));
    expect(left.map((p: { id: number }) => p.id)).toEqual([keepId]);

    await search(page).fill(tag);
    await expect(names(page)).toHaveText([`${tag} keep`]);
    await expect(page.locator('#bulk-toolbar')).toBeHidden();
  });

  test('while selecting, a row click toggles selection instead of opening the project; Cancel clears it', async ({ page, authedRequest }) => {
    const [aId, bId] = await createProjects(authedRequest, [
      { name: `${tag} first` },
      { name: `${tag} second` },
    ]);
    await page.goto('/');
    await search(page).fill(tag);

    await page.locator(`#pcheck-${aId}`).check();
    await page.getByTestId(`project-name-${bId}`).click();
    await expect(page).toHaveURL(/#projects$|\/$/);
    await expect(page.locator('#bulk-count')).toHaveText('2 selected');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#bulk-toolbar')).toBeHidden();
    await expect(page.locator(`#pcheck-${aId}`)).not.toBeChecked();
    await expect(page.locator(`#pcheck-${bId}`)).not.toBeChecked();

    // With nothing selected, a row click navigates again.
    await page.getByTestId(`project-name-${bId}`).click();
    await expect(page).toHaveURL(new RegExp(`#project/${bId}$`));
  });

  test('dismissing the bulk-delete confirmation deletes nothing and keeps the selection', async ({ page, authedRequest }) => {
    const ids = await createProjects(authedRequest, [{ name: `${tag} safe one` }, { name: `${tag} safe two` }]);
    await page.goto('/');
    await search(page).fill(tag);
    await page.locator('#proj-select-all').check();

    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Remove Selected' }).click();

    await expect(page.locator('#bulk-count')).toHaveText('2 selected');
    await expect(rows(page)).toHaveCount(2);
    // Checked via the list: there is no GET /api/projects/{id}, and the SPA
    // catch-all would answer one with a 200 HTML page, proving nothing.
    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    const surviving = items.map((p: { id: number }) => p.id);
    expect(surviving).toEqual(expect.arrayContaining(ids));
  });
});
