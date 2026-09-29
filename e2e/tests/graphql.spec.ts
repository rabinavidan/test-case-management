import { test, expect } from '@playwright/test';
import { gql, errorCodes, seedRun, deleteProject, UPDATE_RESULT } from '../fixtures/graphql';

/**
 * GraphQL API (/graphql) against a real backend — the TypeScript
 * counterpart of tests/api/test_graphql.py, from outside the process: real
 * HTTP, real auth, real database.
 */
test.describe('GraphQL API', () => {
  test('rejects requests without a token with UNAUTHENTICATED', async ({ request }) => {
    const body = await gql(request, '{ me { id } }', {}, null);
    expect(body.data).toBeNull();
    expect(errorCodes(body)).toEqual(['UNAUTHENTICATED']);
  });

  test('mutations build a tree the nested query returns in one round trip', async ({ request }) => {
    const seeded = await seedRun(request, 'tree', 3);
    try {
      const body = await gql(request, `
        query($p: ID!) { project(id: $p) { name suites { name testCases { id status } runs { id summary { total pending passRate } } } } }`,
      { p: seeded.projectId });
      expect(body.errors).toBeUndefined();
      const [suite] = body.data.project.suites;
      expect(suite.testCases.map((tc: { id: string }) => tc.id).sort()).toEqual([...seeded.testCaseIds].sort());
      expect(suite.runs).toEqual([{ id: seeded.runId, summary: { total: 3, pending: 3, passRate: null } }]);
    } finally {
      await deleteProject(request, seeded.projectId);
    }
  });

  test('updateResult is reflected by REST and in the run summary', async ({ request }) => {
    const seeded = await seedRun(request, 'parity');
    try {
      const [tc1, tc2] = seeded.testCaseIds;
      await gql(request, UPDATE_RESULT, { r: seeded.runId, t: tc1, s: 'PASS', n: 'via graphql' });
      await gql(request, UPDATE_RESULT, { r: seeded.runId, t: tc2, s: 'FAIL' });

      const summary = await gql(request, 'query($r: ID!) { run(id: $r) { completedAt summary { passed failed passRate } } }', { r: seeded.runId });
      expect(summary.data.run.summary).toEqual({ passed: 1, failed: 1, passRate: 50 });
      expect(summary.data.run.completedAt).not.toBeNull();

      const rest = await (await request.get(`/api/runs/${seeded.runId}`)).json();
      const byCase = Object.fromEntries(rest.results.map((r: any) => [String(r.testcase_id), r]));
      expect(byCase[tc1]).toMatchObject({ status: 'pass', notes: 'via graphql' });
      expect(byCase[tc2]).toMatchObject({ status: 'fail' });
    } finally {
      await deleteProject(request, seeded.projectId);
    }
  });

  test('errors carry machine-readable codes', async ({ request }) => {
    const notFound = await gql(request, 'mutation { createSuite(projectId: "999999999", input: {name: "x"}) { id } }');
    expect(errorCodes(notFound)).toEqual(['NOT_FOUND']);

    const badEnv = await gql(request, 'mutation { createRun(suiteId: "999999999", input: {name: "x"}) { id } }');
    expect(errorCodes(badEnv)).toEqual(['NOT_FOUND']);

    const missing = await gql(request, '{ run(id: "999999999") { id } }');
    expect(missing).toEqual({ data: { run: null } });
  });

  test('invalid enum values are rejected before execution', async ({ request }) => {
    const body = await gql(request, UPDATE_RESULT, { r: '1', t: '1', s: 'PASSED' });
    expect(body.data).toBeNull();
    expect(body.errors![0].message).toContain('PASSED');
  });

  test('query depth is limited', async ({ request }) => {
    let q = '{ id }';
    for (let i = 0; i < 6; i++) q = `{ suites { project ${q} } }`;
    const body = await gql(request, `{ projects ${q} }`);
    expect(body.errors![0].message).toMatch(/exceeds maximum operation depth/);
  });
});
