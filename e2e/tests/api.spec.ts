import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function getToken(): string {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'auth-state.json'), 'utf-8')).token;
}
const uid = () => `${Date.now()}`;

test.describe('API Tests (no browser)', () => {
  let token: string;
  let headers: Record<string, string>;

  test.beforeAll(() => {
    token = getToken();
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  });

  test('POST /api/projects creates a project', async ({ request }) => {
    const name = `API-Proj-${uid()}`;
    const res = await request.post('/api/projects', { data: { name }, headers });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe(name);
    await request.delete(`/api/projects/${body.id}`, { headers });
  });

  test('GET /api/projects returns a paginated list', async ({ request }) => {
    const res = await request.get('/api/projects', { headers });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(typeof body.total).toBe('number');
    expect(typeof body.page).toBe('number');
  });

  test('DELETE /api/projects/{id} removes the project', async ({ request }) => {
    const proj = await request.post('/api/projects', {
      data: { name: `Del-${uid()}` }, headers,
    });
    const { id } = await proj.json();

    const del = await request.delete(`/api/projects/${id}`, { headers });
    expect(del.status()).toBe(204);

    const get = await request.get('/api/projects', { headers });
    const { items: list } = await get.json();
    expect(list.find((p: { id: number }) => p.id === id)).toBeUndefined();
  });

  test('full CRUD flow: project → suite → testcase → run → results', async ({ request }) => {
    // 1. Create project
    const proj = await request.post('/api/projects', {
      data: { name: `Flow-${uid()}` }, headers,
    });
    expect(proj.status()).toBe(201);
    const { id: projectId } = await proj.json();

    // 2. Create suite
    const suite = await request.post(`/api/projects/${projectId}/suites`, {
      data: { name: `Suite-${uid()}` }, headers,
    });
    expect(suite.status()).toBe(201);
    const { id: suiteId } = await suite.json();

    // 3. Create test case
    const tc = await request.post(`/api/suites/${suiteId}/testcases`, {
      data: { title: 'Full flow TC', status: 'active', priority: 'high' }, headers,
    });
    expect(tc.status()).toBe(201);
    const { id: tcId } = await tc.json();

    // 4. Create run
    const run = await request.post(`/api/suites/${suiteId}/runs`, {
      data: { name: `Run-${uid()}` }, headers,
    });
    expect(run.status()).toBe(201);
    const { id: runId } = await run.json();

    // 5. Update result
    const result = await request.put(`/api/runs/${runId}/results/${tcId}`, {
      data: { status: 'pass', notes: 'Automated pass' }, headers,
    });
    expect(result.ok()).toBeTruthy();
    const resultBody = await result.json();
    expect(resultBody.status).toBe('pass');

    // 6. Verify stats
    const stats = await request.get(`/api/projects/${projectId}/stats`, { headers });
    expect(stats.ok()).toBeTruthy();
    const statsBody = await stats.json();
    expect(statsBody.last_run_pass).toBeGreaterThanOrEqual(1);

    // Cleanup
    await request.delete(`/api/projects/${projectId}`, { headers });
  });
});
