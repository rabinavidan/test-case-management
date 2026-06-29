import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Name prefixes used by every test spec — anything matching these is safe to delete.
const TEST_NAME_PREFIXES = [
  'Test Project_',
  'Delete Me_',
  'Stats Project_',
  'RunProj-',
  'Suite Test Project_',
  'TC Project_',
];

async function globalTeardown() {
  const authStatePath = path.join(__dirname, 'auth-state.json');
  let token: string;
  try {
    const { token: t } = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
    token = t;
  } catch {
    console.warn('[teardown] auth-state.json not found — skipping project cleanup');
    return;
  }

  const baseURL = process.env.BASE_URL || 'http://localhost:8000';
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  try {
    const res = await ctx.get('/api/projects');
    if (!res.ok()) {
      console.warn(`[teardown] GET /api/projects failed: ${res.status()}`);
      return;
    }

    const projects: Array<{ id: number; name: string }> = await res.json();
    const toDelete = projects.filter(p =>
      TEST_NAME_PREFIXES.some(prefix => p.name.startsWith(prefix))
    );

    await Promise.all(
      toDelete.map(p =>
        ctx.delete(`/api/projects/${p.id}`)
          .then(r => console.log(`[teardown] ${r.ok() ? 'deleted' : `FAILED (${r.status()})`} project "${p.name}" (id=${p.id})`))
          .catch(e => console.warn(`[teardown] error deleting project "${p.name}":`, e))
      )
    );

    if (toDelete.length === 0) {
      console.log('[teardown] No leftover test projects found.');
    } else {
      console.log(`[teardown] Cleaned up ${toDelete.length} test project(s).`);
    }
  } finally {
    await ctx.dispose();
  }
}

export default globalTeardown;
