/**
 * The session token global-setup obtains once and every worker reuses.
 * One reader and one writer, instead of each spec parsing the file itself.
 */
import * as fs from 'fs';
import { config } from './env';

interface AuthState {
  token: string;
}

export function writeAuthToken(token: string): void {
  fs.writeFileSync(config.authStatePath, JSON.stringify({ token } satisfies AuthState, null, 2));
}

/** Throws a pointed error when global-setup has not run (or failed). */
export function readAuthToken(): string {
  if (!fs.existsSync(config.authStatePath)) {
    throw new Error(
      `${config.authStatePath} is missing — global-setup.ts did not log in. ` +
      `Is the app running at ${config.baseURL}?`,
    );
  }
  const { token } = JSON.parse(fs.readFileSync(config.authStatePath, 'utf-8')) as AuthState;
  return token;
}

export function hasAuthToken(): boolean {
  return fs.existsSync(config.authStatePath);
}
