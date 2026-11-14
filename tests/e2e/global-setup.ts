import { request } from '@playwright/test';
import { config } from './config/env';
import { writeAuthToken } from './config/auth-state';
import { routes } from './api/routes';

/**
 * Logs the e2e account in once and saves the token for every worker.
 * Registration is idempotent: a 400 for an existing user is expected.
 */
async function globalSetup() {
  const context = await request.newContext({ baseURL: config.baseURL });
  const { username, password } = config.credentials;

  await context.post(routes.register, {
    data: { username, password, email: 'e2e@test.com' },
  }).catch(() => undefined); // already registered, or registration closed

  const loginResponse = await context.post(routes.login, { data: { username, password } });
  if (!loginResponse.ok()) {
    throw new Error(`Login as ${username} at ${config.baseURL} failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }

  const body = await loginResponse.json();
  const token = body.access_token || body.token || body.data?.token;
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(body)}`);

  writeAuthToken(token);
  await context.dispose();
}

export default globalSetup;
