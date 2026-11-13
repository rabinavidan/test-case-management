import { test as base, APIRequestContext } from '@playwright/test';
import { config } from '../config/env';
import { readAuthToken } from '../config/auth-state';

type AuthFixtures = {
  authToken: string;
  authedRequest: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  authToken: async ({}, use) => {
    await use(readAuthToken());
  },

  authedRequest: async ({ playwright, authToken }, use) => {
    const context = await playwright.request.newContext({
      baseURL: config.baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
