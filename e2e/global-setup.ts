import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup() {
  const baseURL = process.env.BASE_URL || 'http://localhost:8000';
  const context = await request.newContext({ baseURL });

  // Register test user (ignore 400 if already exists)
  try {
    await context.post('/api/auth/register', {
      data: {
        username: 'testuser_e2e',
        password: 'Test@12345',
        email: 'e2e@test.com',
      },
    });
  } catch {
    // user may already exist
  }

  // Login to get token
  const loginResponse = await context.post('/api/auth/login', {
    data: {
      username: 'testuser_e2e',
      password: 'Test@12345',
    },
  });

  if (!loginResponse.ok()) {
    throw new Error(`Login failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }

  const body = await loginResponse.json();
  const token = body.access_token || body.token || body.data?.token;

  if (!token) {
    throw new Error(`No token in login response: ${JSON.stringify(body)}`);
  }

  const authStatePath = path.join(__dirname, 'auth-state.json');
  fs.writeFileSync(authStatePath, JSON.stringify({ token }, null, 2));

  await context.dispose();
}

export default globalSetup;
