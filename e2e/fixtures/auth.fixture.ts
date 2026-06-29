import { test as base, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

type AuthFixtures = {
  authToken: string;
  authedRequest: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  authToken: async ({}, use) => {
    const authStatePath = path.join(__dirname, '..', 'auth-state.json');
    const raw = fs.readFileSync(authStatePath, 'utf-8');
    const { token } = JSON.parse(raw);
    await use(token);
  },

  authedRequest: async ({ playwright, authToken }, use) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:8000';
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
