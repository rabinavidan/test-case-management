import { test, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';

// The home page and the main signed-in pages load cleanly: no uncaught
// script error, no console error, no request that fails or returns 4xx/5xx,
// and nothing reported to the app's own client-error log. These used to be
// silently broken - the SPA fallback answered missing scripts with the HTML
// home page, so every load threw "Unexpected token '<'" twice and posted it
// to /api/logs/client.

type Problems = { errors: string[]; badResponses: string[]; clientLogs: number; since: number };

function watch(page: Page): Problems {
  const p: Problems = { errors: [], badResponses: [], clientLogs: 0, since: Date.now() };
  page.on('pageerror', (e) => p.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') p.errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => p.badResponses.push(`failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => { if (r.status() >= 400) p.badResponses.push(`${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/logs/client') p.clientLogs++; });
  return p;
}

// A 404 for a project, suite or run that another user deleted while the page
// loaded is correct behaviour (the sidebar, for one, fetches every project's
// stats); the app handles it. It's excused only after asking the API that the
// resource really is gone - a 404 for one that still exists stays a failure.
// Browsers also log each 4xx fetch as a console error, which can't be
// suppressed from script, so one such line is excused per excused 404.
const RESOURCE = /^\/api\/(projects|suites|runs)\/(\d+)(?:\/|$)/;

async function isGone(page: Page, url: string, since: number) {
  const m = new URL(url).pathname.match(RESOURCE);
  if (!m) return false;
  const res = await page.request.get(`/api/${m[1]}/${m[2]}`, { failOnStatusCode: false });
  if (res.status() === 404) return true;
  // SQLite reuses a deleted row's id: if what's at that id now was created
  // after this page started loading, the one the page asked about is gone.
  const createdAt = Date.parse((await res.json()).created_at ?? '');
  return res.ok() && createdAt > since;
}

async function expectClean(page: Page, p: Problems, label: string) {
  await page.waitForLoadState('networkidle');
  let excused = 0;
  const bad: string[] = [];
  for (const entry of p.badResponses) {
    const [status, url] = entry.split(': ', 2);
    if (status === '404' && (await isGone(page, url, p.since))) excused++;
    else bad.push(entry);
  }
  const errors = p.errors.filter((e) => {
    if (excused > 0 && /Failed to load resource: .*404/.test(e)) { excused--; return false; }
    return true;
  });
  expect(errors, `${label}: script/console errors`).toEqual([]);
  expect(bad, `${label}: failed or 4xx/5xx requests`).toEqual([]);
  expect(p.clientLogs, `${label}: client-error reports`).toBe(0);
}

test.describe('Home page smoke — guest', () => {
  test('loads cleanly, with every section rendered', async ({ page }) => {
    const p = watch(page);
    await page.goto('/#projects');
    for (const id of ['success-stories-section', 'top-repos-section', 'ai-live-demo-section', 'recruiter-tour-banner']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.locator('.owner-banner')).toBeVisible();
    await expectClean(page, p, 'guest home');
  });

  test('the footer shows the version the API reports', async ({ page }) => {
    const { version } = await (await page.request.get('/api/version')).json();
    await page.goto('/#projects');
    await expect(page.locator('#app-version')).toHaveText(`v${version}`);
  });

  test('the architecture showcase panel opens and closes, and says so to assistive tech', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('tf_showcase_expanded'));
    await page.goto('/#projects');
    const toggle = page.locator('#showcase-toggle-btn');
    const panel = page.locator('#showcase-content');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Live Architecture')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  test('the page declares a favicon that loads, so browsers never fall back to /favicon.ico', async ({ page }) => {
    await page.goto('/#projects');
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toBe('/static/favicon.svg');
    const icon = await page.request.get(href!);
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toBe('image/svg+xml');
  });

  test('the page describes itself to search engines and link previews, with an image that loads', async ({ page }) => {
    await page.goto('/#projects');
    const meta = (sel: string) => page.locator(sel).getAttribute('content');
    expect((await meta('meta[name="description"]'))?.length).toBeGreaterThan(50);
    expect(await meta('meta[property="og:title"]')).toContain('TestFlow');
    expect(await meta('meta[property="og:description"]')).toBeTruthy();
    expect(await meta('meta[property="og:type"]')).toBe('website');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    // Crawlers resolve nothing relative: both URLs must be absolute.
    expect(await meta('meta[property="og:url"]')).toMatch(/^https:\/\//);
    const image = (await meta('meta[property="og:image"]'))!;
    expect(image).toMatch(/^https:\/\/.+\/static\/og-image\.png$/);
    // Served by this build (the absolute URL points at production).
    const res = await page.request.get(new URL(image).pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    const body = await res.body();
    expect(body.readUInt32BE(16)).toBe(1200); // PNG IHDR width
    expect(body.readUInt32BE(20)).toBe(630); // and height
  });

  test('a missing file or API route is a real 404, while page paths still load the app', async ({ page }) => {
    const api = await page.request.get('/api/does-not-exist');
    expect(api.status()).toBe(404);
    expect(await api.json()).toEqual({ detail: 'Not Found' });
    for (const path of ['/missing.js', '/_vercel/insights/script.js', '/static/missing.css']) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    const deep = await page.request.get('/some/client-side/route');
    expect(deep.status()).toBe(200);
    expect(deep.headers()['content-type']).toContain('text/html');
  });
});

test.describe('Home page smoke — signed in', () => {
  test('the home page and the main pages load cleanly', async ({ page, authToken, authedRequest }) => {
    const tag = `Smoke_${Date.now()}_${test.info().workerIndex}_${test.info().repeatEachIndex}`;
    const project = await (await authedRequest.post('/api/projects', { data: { name: `${tag} project` } })).json();
    try {
      const suite = await (await authedRequest.post(`/api/projects/${project.id}/suites`, { data: { name: `${tag} suite` } })).json();
      await authedRequest.post(`/api/suites/${suite.id}/testcases`, { data: { title: `${tag} case`, priority: 'medium', status: 'active' } });
      const run = await (await authedRequest.post(`/api/suites/${suite.id}/runs`, { data: { name: `${tag} run` } })).json();
      await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);

      for (const [label, url] of [
        ['home', '/#projects'], ['project', `/#project/${project.id}`], ['suite', `/#suite/${suite.id}`],
        ['run', `/#run/${run.id}`], ['environments', '/#environments'], ['users', '/#users'], ['log center', '/#logs'],
      ]) {
        const p = watch(page);
        await page.goto(url);
        await expect(page.locator('.view:not(.hidden) h1').first(), label).toBeVisible({ timeout: 15_000 });
        await expectClean(page, p, label);
        page.removeAllListeners();
      }
    } finally {
      await authedRequest.delete(`/api/projects/${project.id}`);
    }
  });
});
