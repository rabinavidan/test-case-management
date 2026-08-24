import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as fc from 'fast-check';

/**
 * Contract tests: validate real API responses against the app's own
 * OpenAPI schema (fetched live from `/openapi.json`), using ajv (JSON
 * Schema) + ajv-formats (strict RFC 3339 `date-time`) — the TypeScript-side
 * counterpart to `tests/contract/test_openapi_contract.py` (Schemathesis).
 *
 * Two regression tests exist because this suite is what actually found, and
 * then re-found, real bugs:
 *
 * - `created_at`/`completed_at`/`executed_at` fields: Pydantic's
 *   `datetime.utcnow()` serializes without a UTC offset by default, which
 *   fails RFC 3339's `date-time` format (fixed with `UTCDatetime` in
 *   api/schemas.py). Fixing that with a custom `PlainSerializer` alone,
 *   without `WithJsonSchema`, silently DROPPED `format: date-time` from the
 *   generated OpenAPI schema instead of preserving it — this suite's
 *   ajv-formats check is the reason that regression didn't ship.
 * - Extreme-integer path params (bigger than SQLite's 64-bit INTEGER range)
 *   used to crash with an unhandled `OverflowError` instead of a clean 4xx
 *   (fixed with an exception handler in api/main.py).
 */

function getToken(): string {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'auth-state.json'), 'utf-8')).token;
}
const uid = () => `${Date.now()}`;

type OpenApiDoc = {
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, unknown> };
};

// Looks up the declared response schema for one operation. Returns `undefined`
// if the operation/status isn't documented at all (a real doc gap, asserted on
// by the caller) — distinct from an inline `{}` schema, which some routes use
// when they return a plain dict with no `response_model` (e.g. PUT .../results/
// {tc_id} in api/main.py): that's still a documented, if maximally permissive,
// contract, so it resolves to a schema that accepts anything rather than erroring.
function responseSchema(doc: OpenApiDoc, urlPath: string, method: string, status: string) {
  const operation = doc.paths[urlPath]?.[method.toLowerCase()];
  const schema = operation?.responses?.[status]?.content?.['application/json']?.schema;
  if (schema === undefined) return undefined;
  if (schema.$ref) return { $ref: 'openapi#' + schema.$ref.replace(/^#/, '') };
  return schema;
}

test.describe('Contract: responses match the OpenAPI schema', () => {
  let headers: Record<string, string>;
  let doc: OpenApiDoc;
  let ajv: Ajv2020;

  test.beforeAll(async ({ request }) => {
    headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    const res = await request.get('/openapi.json');
    expect(res.ok()).toBeTruthy();
    doc = await res.json();

    ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ components: doc.components }, 'openapi');
  });

  function validateAgainst(urlPath: string, method: string, status: string, body: unknown) {
    const schema = responseSchema(doc, urlPath, method, status);
    expect(schema, `no ${status} response documented at all for ${method} ${urlPath}`).not.toBeUndefined();
    const validate = ajv.compile(schema!);
    const valid = validate(body);
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBeTruthy();
  }

  test('full CRUD flow: every response — including datetime fields — matches its declared schema', async ({ request }) => {
    const proj = await request.post('/api/projects', { data: { name: `Contract-${uid()}` }, headers });
    const projBody = await proj.json();
    validateAgainst('/api/projects', 'post', '201', projBody);
    const projectId = projBody.id;

    const suite = await request.post(`/api/projects/${projectId}/suites`, {
      data: { name: `Suite-${uid()}` }, headers,
    });
    const suiteBody = await suite.json();
    validateAgainst('/api/projects/{project_id}/suites', 'post', '201', suiteBody);
    const suiteId = suiteBody.id;

    const tc = await request.post(`/api/suites/${suiteId}/testcases`, {
      data: { title: 'Contract TC', status: 'active', priority: 'high' }, headers,
    });
    const tcBody = await tc.json();
    validateAgainst('/api/suites/{suite_id}/testcases', 'post', '201', tcBody);
    const tcId = tcBody.id;

    const run = await request.post(`/api/suites/${suiteId}/runs`, {
      data: { name: `Run-${uid()}` }, headers,
    });
    const runBody = await run.json();
    validateAgainst('/api/suites/{suite_id}/runs', 'post', '201', runBody);
    const runId = runBody.id;

    const result = await request.put(`/api/runs/${runId}/results/${tcId}`, {
      data: { status: 'pass', notes: 'contract test' }, headers,
    });
    const resultBody = await result.json();
    validateAgainst('/api/runs/{run_id}/results/{tc_id}', 'put', '200', resultBody);

    const stats = await request.get(`/api/projects/${projectId}/stats`, { headers });
    const statsBody = await stats.json();
    validateAgainst('/api/projects/{project_id}/stats', 'get', '200', statsBody);

    await request.delete(`/api/projects/${projectId}`, { headers });
  });

  test('extreme integer path params return a clean 4xx, never a raw crash', async ({ request }) => {
    // Mirrors what int() accepts in Python but sits outside SQLite's signed
    // 64-bit INTEGER range — the exact shape of value that used to crash
    // with an unhandled OverflowError before api/main.py's exception handler.
    const extremeIds = fc.oneof(
      fc.bigInt({ min: 2n ** 63n, max: 2n ** 128n }),
      fc.bigInt({ min: -(2n ** 128n), max: -(2n ** 63n) - 1n }),
    );

    await fc.assert(
      fc.asyncProperty(extremeIds, async (id) => {
        const res = await request.get(`/api/projects/${id.toString()}/stats`, { headers });
        expect(res.status(), `status for id=${id}`).toBeLessThan(500);
        if (res.status() === 422) {
          const body = await res.json();
          validateAgainst('/api/projects/{project_id}/stats', 'get', '422', body);
        }
      }),
      { numRuns: 15 },
    );
  });
});
