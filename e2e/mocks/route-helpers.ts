/**
 * Thin helpers over `page.route()` for the serverless mocked E2E specs
 * (`e2e/tests/mocked-serverless-*.spec.ts`). See `e2e/mocks/factories.ts`
 * for the response shapes these fulfil.
 */
import type { Page, Route } from '@playwright/test';
import { mockUser, mockTokenResponse, type UserResponse } from './factories';

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
