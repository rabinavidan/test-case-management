import { test, expect } from '../fixtures/auth.fixture';
import type { Page, Locator, APIRequestContext } from '@playwright/test';

// Runs only on the phone and tablet projects (playwright.config.ts): Pixel 7,
// iPhone 13 and iPad, with real device emulation - touch, isMobile and the
// mobile viewport. A page wider than the device makes a phone zoom out to fit
// it, so "fits" here means the layout is exactly the device's width.

const isPhone = (page: Page) => page.viewportSize()!.width < 768; // below Tailwind's md: no sidebar

async function layoutWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

// Polled: the Tailwind CDN builds its CSS just after the markup lands, and
// before it does, nothing wraps or hides yet. A real overflow never settles.
async function expectFitsDevice(page: Page, label: string) {
  const device = page.viewportSize()!.width;
  try {
    await expect.poll(() => layoutWidth(page)).toBeLessThanOrEqual(device);
  } catch {
    // Name what sticks out: the outermost elements past the device's edge.
    const offenders = await page.evaluate((w) => {
      const past = Array.from(document.querySelectorAll('body *')).filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > w + 1 && !e.closest('[class*="overflow-x-auto"],[class*="overflow-hidden"]');
      });
      const set = new Set(past);
      return past.filter((e) => !set.has(e.parentElement!)).slice(0, 5).map((e) =>
        `<${e.tagName.toLowerCase()} class="${String((e as HTMLElement).className).slice(0, 60)}"> right=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || '').trim().slice(0, 40)}"`);
    }, device);
    throw new Error(`${label}: layout ${await layoutWidth(page)}px, wider than the ${device}px device:\n  ${offenders.join('\n  ')}`);
  }
}

async function expectOnScreen(page: Page, el: Locator, label: string) {
  await expect(el, label).toBeVisible();
  const box = (await el.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x, `${label} starts off-screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} ends off-screen`).toBeLessThanOrEqual(width + 1);
}

async function seed(api: APIRequestContext, tag: string) {
  const json = async (r: Promise<import('@playwright/test').APIResponse>) => (await r).json();
  const project = await json(api.post('/api/projects', { data: { name: `${tag} project`, description: 'Responsive layout check' } }));
  const suite = await json(api.post(`/api/projects/${project.id}/suites`, { data: { name: `${tag} suite` } }));
  for (const title of ['Login works on a phone', 'Checkout handles a very long test case title that has to wrap on small screens']) {
    await api.post(`/api/suites/${suite.id}/testcases`, { data: { title, priority: 'high', status: 'active' } });
  }
  const run = await json(api.post(`/api/suites/${suite.id}/runs`, { data: { name: `${tag} run` } }));
  return { projectId: project.id as number, suiteId: suite.id as number, runId: run.id as number };
}

test.describe('Responsive — guest pages', () => {
  test('the home page fits the device, with Sign in and its first tab, Success Stories, on screen', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('success-stories-section')).toBeVisible();
    await expectFitsDevice(page, 'guest home');
    await expectOnScreen(page, page.getByTestId('signin-btn'), 'Sign in');

    if (isPhone(page)) {
      // One card at a time, with the next one peeking in to show it swipes.
      const slide = (await page.getByTestId('story-slide').first().boundingBox())!;
      expect(slide.width / page.viewportSize()!.width).toBeGreaterThan(0.7);
    }
    await page.getByTestId('stories-next').tap();
    await expect.poll(() => page.getByTestId('stories-track').evaluate((t) => t.scrollLeft)).toBeGreaterThan(0);
  });

  test('the sign-in modal fits the device', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('signin-btn').tap();
    await expectOnScreen(page, page.locator('#auth-form-container > div'), 'sign-in form');
    await expectOnScreen(page, page.getByTestId('auth-submit-btn'), 'sign-in submit');
  });

  test('the Recruiter Tour card fits the device and its buttons are tappable', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('start-tour-btn').tap();
    await expectOnScreen(page, page.getByTestId('recruiter-tour-card'), 'tour card');
    await page.getByTestId('tour-next-btn').tap();
    await expect(page.getByTestId('tour-step-label')).toHaveText(/Step 2 of 5/);
    await expectFitsDevice(page, 'tour open');
  });
});

test.describe('Responsive — signed-in pages', () => {
  let tag: string;
  let ids: { projectId: number; suiteId: number; runId: number };

  test.beforeEach(async ({ page, authToken, authedRequest }, testInfo) => {
    tag = `Resp_${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
    ids = await seed(authedRequest, tag);
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test.afterEach(async ({ authedRequest }) => {
    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    for (const p of items.filter((p: { name: string }) => p.name.startsWith(tag))) {
      await authedRequest.delete(`/api/projects/${p.id}`);
    }
  });

  test('every page fits the device, keeps its header controls on screen and ends its breadcrumb on itself', async ({ page }) => {
    test.setTimeout(90_000); // nine pages
    const pages: Array<[string, string, string | null]> = [
      ['projects', '/#projects', 'Projects'],
      ['project', `/#project/${ids.projectId}`, `${tag} project`],
      ['suite', `/#suite/${ids.suiteId}`, `${tag} suite`],
      ['suite test cases', `/#suite/${ids.suiteId}/testcases`, 'Test Cases'],
      ['suite runs', `/#suite/${ids.suiteId}/runs`, 'Test Runs'],
      ['run', `/#run/${ids.runId}`, `${tag} run`],
      ['environments', '/#environments', null],
      ['users', '/#users', null],
      ['log center', '/#logs', null],
    ];
    for (const [label, url, crumb] of pages) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      // A page-loaded wait, not a speed check: under parallel load a render can take a while.
      await expect(page.locator('.view:not(.hidden) h1').first()).toBeVisible({ timeout: 15_000 });
      await expectFitsDevice(page, label);
      for (const id of ['logo-btn', 'environments-btn', 'users-btn', 'logs-btn', 'logout-btn']) {
        await expectOnScreen(page, page.getByTestId(id), `${label}: ${id}`);
      }
      if (crumb) {
        // The breadcrumb scrolls sideways when long; its last item, the current page, must be in view.
        const crumbs = page.getByTestId('breadcrumb');
        const current = crumbs.locator('span').last();
        await expect(current).toHaveText(crumb.length > 0 ? new RegExp(crumb.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : /./);
        const [c, b] = [(await current.boundingBox())!, (await crumbs.boundingBox())!];
        expect(c.x + c.width, `${label}: current breadcrumb item cut off`).toBeLessThanOrEqual(b.x + b.width + 1);
      }
    }
  });

  test('a phone user can go from the home page to recording a result, by tapping alone', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    if (isPhone(page)) await expect(page.locator('aside')).toBeHidden(); // no sidebar to lean on

    await page.locator('#proj-search').fill(tag);
    await page.getByTestId(`project-row-${ids.projectId}`).tap();
    await expect(page).toHaveURL(new RegExp(`#project/${ids.projectId}$`));

    await page.getByTestId(`suite-card-${ids.suiteId}`).tap();
    await expect(page).toHaveURL(new RegExp(`#suite/${ids.suiteId}$`));
    await expectFitsDevice(page, 'suite');

    await page.getByTestId(`run-card-${ids.runId}`).tap();
    await expect(page).toHaveURL(new RegExp(`#run/${ids.runId}$`));

    const row = page.locator('#view-run .space-y-3 > div').filter({ hasText: 'Login works on a phone' });
    await row.getByRole('button', { name: /record/i }).tap();
    await expectOnScreen(page, page.getByTestId('modal-box'), 'result modal');
    await page.locator('#rs-pass').tap();
    await page.getByRole('button', { name: /save result/i }).tap();
    await expect(row.locator('[data-status-badge]')).toHaveAttribute('data-status-badge', 'pass');

    await page.getByRole('button', { name: 'Back to Suite' }).tap();
    await expect(page).toHaveURL(new RegExp(`#suite/${ids.suiteId}$`));
  });

  test('the projects table drops secondary columns on a phone, and a row still opens its project', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.locator('#proj-search').fill(tag);
    const row = page.getByTestId(`project-row-${ids.projectId}`);
    await expect(row).toBeVisible();
    if (isPhone(page)) {
      const visibleCells = await row.locator('td').evaluateAll((tds) => tds.filter((td) => getComputedStyle(td).display !== 'none').length);
      expect(visibleCells).toBeLessThanOrEqual(3); // checkbox, name, actions
    }
    await expectOnScreen(page, page.getByTestId(`project-name-${ids.projectId}`), 'project name');
    await expectFitsDevice(page, 'projects table');
    await row.tap();
    await expect(page).toHaveURL(new RegExp(`#project/${ids.projectId}$`));
  });

  test('the New Project modal fits the device with its submit button reachable', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('new-project-btn').tap();
    await expectOnScreen(page, page.getByTestId('modal-box'), 'New Project modal');
    const submit = page.getByTestId('modal-submit-btn');
    await submit.scrollIntoViewIfNeeded();
    await expectOnScreen(page, submit, 'modal submit');
    await expectFitsDevice(page, 'modal open');
  });
});
