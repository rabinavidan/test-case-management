/**
 * Thin helpers over `page.route()` for the serverless mocked E2E specs
 * (`e2e/tests/mocked-serverless-*.spec.ts`). See `e2e/mocks/factories.ts`
 * for the response shapes these fulfil.
 */
import type { Page, Route } from '@playwright/test';
import { mockUser, mockTokenResponse, type Project, type TestSuite, type UserResponse } from './factories';

/** Fulfils a page.route() handler with a JSON body — the one-liner every mocked spec repeats. */
export async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Seeds a fake session before the page ever loads (`addInitScript`, must be
 * called before `page.goto()`) and mocks `GET /api/auth/me` — the bootstrap
 * call `static/app.js` makes on every page load to rehydrate the signed-in
 * user from a stored token (see e2e/README.md's "Serverless mocked E2E
 * tests" section for why both are needed: seeding `tf_token` alone isn't
 * enough, the app still round-trips through `/api/auth/me` before it trusts
 * that token).
 */
export async function mockAuthSession(page: Page, user: UserResponse = mockUser()): Promise<void> {
  const token = mockTokenResponse({ user }).access_token;
  await page.addInitScript((t) => localStorage.setItem('tf_token', t), token);
  await page.route(
    (url) => url.pathname === '/api/auth/me',
    (route) => fulfillJson(route, 200, user),
  );
}

/** Matches a request by exact pathname — the precise-match style this
 * repo's mocked specs use throughout (`page.route()`'s predicate only sees
 * the URL, not the request, so filtering by HTTP method happens inside the
 * route handler via `route.request().method()` when a spec needs it), so a
 * mock for `/api/projects` never accidentally also matches
 * `/api/projects/123/suites`. */
export function byPath(pathname: string) {
  return (url: URL) => url.pathname === pathname;
}

/**
 * Answers GET /api/projects/{id} and GET /api/suites/{id} — the by-id
 * lookups the project, suite, test-case, run-history and run pages make —
 * from the given fixtures, and 404s anything else the way the real API does.
 * Other methods fall through to any more specific route a spec registers
 * (e.g. its own DELETE /api/projects/{id} handler).
 */
export async function mockParentLookups(page: Page, projects: Project[], suites: TestSuite[] = []): Promise<void> {
  const byId = <T extends { id: number }>(items: T[], kind: string) => async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    const found = items.find((x) => x.id === id);
    await (found ? fulfillJson(route, 200, found) : fulfillJson(route, 404, { detail: `${kind} not found` }));
  };
  await page.route((url) => /^\/api\/projects\/\d+$/.test(url.pathname), byId(projects, 'Project'));
  await page.route((url) => /^\/api\/suites\/\d+$/.test(url.pathname), byId(suites, 'Suite'));
}
