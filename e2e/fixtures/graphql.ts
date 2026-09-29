/**
 * Minimal GraphQL helpers for the real-backend specs (graphql.spec.ts,
 * realtime.spec.ts). Deliberately no client library: the specs assert on
 * the raw `{ data, errors }` envelope and `extensions.code`, which is what
 * every client — browser, Java, curl — actually receives from /graphql.
 */
import { APIRequestContext, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface GqlError { message: string; extensions?: { code?: string } }
export interface GqlResponse<T> { data: T | null; errors?: GqlError[] }

export function readToken(): string {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'auth-state.json'), 'utf-8')).token;
}

export async function gql<T = any>(
  request: APIRequestContext,
  query: string,
  variables: Record<string, unknown> = {},
  token: string | null = readToken(),
): Promise<GqlResponse<T>> {
  const res = await request.post('/graphql', {
    data: { query, variables },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  // GraphQL reports errors in the body, not the status code.
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

export const errorCodes = (body: GqlResponse<unknown>) => (body.errors ?? []).map((e) => e.extensions?.code);

/** project → suite → `cases` active test cases → run, created through GraphQL mutations. */
export async function seedRun(request: APIRequestContext, label: string, cases = 2) {
  const uid = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const project = (await gql(request, `mutation($n: String!) { createProject(input: {name: $n}) { id } }`, { n: `GQL ${uid}` }))
    .data!.createProject;
  const suite = (await gql(request, `mutation($p: ID!) { createSuite(projectId: $p, input: {name: "Suite"}) { id } }`, { p: project.id }))
    .data!.createSuite;
  const testCaseIds: string[] = [];
  for (let i = 0; i < cases; i++) {
    const tc = await gql(request, `mutation($s: ID!, $t: String!) { createTestCase(suiteId: $s, input: {title: $t, status: ACTIVE}) { id } }`,
      { s: suite.id, t: `Case ${i + 1} ${uid}` });
    testCaseIds.push(tc.data!.createTestCase.id);
  }
  const run = (await gql(request, `mutation($s: ID!) { createRun(suiteId: $s, input: {name: "Live run"}) { id } }`, { s: suite.id }))
    .data!.createRun;
  return { projectId: project.id as string, suiteId: suite.id as string, runId: run.id as string, testCaseIds, uid };
}

export async function deleteProject(request: APIRequestContext, projectId: string) {
  await request.delete(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${readToken()}` } });
}

export const UPDATE_RESULT = `
  mutation($r: ID!, $t: ID!, $s: ResultStatus!, $n: String) {
    updateResult(runId: $r, testCaseId: $t, input: {status: $s, notes: $n}) { id status notes }
  }`;
