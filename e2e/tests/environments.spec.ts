import { test, expect } from '../fixtures/auth.fixture';
import type { APIRequestContext } from '@playwright/test';

// The Environments page: the four-stage pipeline (staging -> regression ->
// preprod -> prod) with simulated per-environment telemetry, and runs that
// record which environment they ran in.

type Env = { key: string; name: string; status: string; node_name: string; namespace: string; region: string;
  pods_ready: number; pods_desired: number; cpu_pct: number; mem_pct: number };

const PIPELINE = ['staging', 'regression', 'preprod', 'prod'];

async function environments(api: APIRequestContext): Promise<Env[]> {
  return (await api.get('/api/environments')).json();
}

test.describe('Environments', () => {
  test.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test('shows the four environments in pipeline order, with the figures the API reports', async ({ page, authedRequest }) => {
    // Telemetry is fixed within a 5-minute window; reading before and after
    // the page load means one of them matches even across a window boundary.
    const before = await environments(authedRequest);
    await page.goto('/#environments');
    await expect(page.getByRole('heading', { name: 'Environments' })).toBeVisible();
    const after = await environments(authedRequest);

    const cards = page.locator('[data-testid^="env-card-"]');
    await expect(cards).toHaveCount(4);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(PIPELINE.map((k) => `env-card-${k}`));

    const shown = await cards.evaluateAll((els) => els.map((e) => e.textContent!.replace(/\s+/g, ' ')));
    const matches = (envs: Env[]) => envs.every((e, i) =>
      [e.name, e.status, e.node_name, e.namespace, e.region, `${e.pods_ready}/${e.pods_desired}`, `${e.cpu_pct}%`, `${e.mem_pct}%`]
        .every((part) => shown[i].includes(part)));
    expect(matches(before) || matches(after), `cards: ${JSON.stringify(shown)}`).toBe(true);

    await expect(page.getByText('simulated telemetry')).toBeVisible();
  });

  test('each status agrees with its pod counts, and each bar with its percentage', async ({ page }) => {
    await page.goto('/#environments');
    for (const key of PIPELINE) {
      const card = page.getByTestId(`env-card-${key}`);
      const text = (await card.textContent())!.replace(/\s+/g, ' ');
      const [, ready, desired] = text.match(/Pods\s*(\d+)\/(\d+)/)!.map(Number);
      const expected = ready === desired ? 'healthy' : ready > 0 ? 'degraded' : 'down';
      await expect(card, key).toContainText(expected);

      const bars = await card.locator('.h-1\\.5 > div').evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.width)));
      // Label and value are adjacent elements, so no guaranteed space between them.
      const pcts = [...text.matchAll(/(CPU|Mem)\s*([\d.]+)%/g)].map((m) => parseFloat(m[2]));
      expect(pcts, key).toHaveLength(2);
      expect(bars, key).toEqual(pcts);
      for (const p of pcts) expect(p).toBeGreaterThanOrEqual(0), expect(p).toBeLessThanOrEqual(100);
    }
  });

  test('a run started in an environment carries it', async ({ page, authedRequest }, testInfo) => {
    const tag = `EnvRun_${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
    const project = await (await authedRequest.post('/api/projects', { data: { name: `${tag} project` } })).json();
    try {
      const suite = await (await authedRequest.post(`/api/projects/${project.id}/suites`, { data: { name: `${tag} suite` } })).json();
      await authedRequest.post(`/api/suites/${suite.id}/testcases`, { data: { title: 'Case', priority: 'medium', status: 'active' } });

      await page.goto(`/#suite/${suite.id}`);
      await page.getByRole('button', { name: /start run/i }).first().click();
      await page.locator('#f-name').fill(`${tag} run`);
      await page.locator('#f-environment').selectOption('preprod');
      await page.getByTestId('modal-body').getByRole('button', { name: /start run/i }).click();
      await page.waitForURL(/#run\/\d+/);
      const runId = Number(page.url().match(/run\/(\d+)/)![1]);

      await expect(page.locator('#view-run h1 ~ span').filter({ hasText: /^preprod$/ })).toBeVisible();
      expect((await (await authedRequest.get(`/api/runs/${runId}`)).json()).environment_key).toBe('preprod');
    } finally {
      await authedRequest.delete(`/api/projects/${project.id}`);
    }
  });

  test('a guest cannot read environment telemetry', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:8000' });
    expect((await anon.get('/api/environments')).status()).toBe(401);
    await anon.dispose();
  });
});
