/**
 * Config & global variables — the one place the suite reads its environment.
 *
 * Every target URL, credential, timeout and file location the suite needs is
 * resolved here, once, with a documented default. Nothing else in e2e/ reads
 * `process.env` (eslint.config.mjs enforces it), so "how do I point the suite
 * at staging?" has a single answer: set the variables below.
 *
 *   BASE_URL          app under test (real backend)          default http://localhost:8000
 *   MOCKED_BASE_URL   static server for the mocked specs     default http://localhost:8010
 *   E2E_USERNAME      account global-setup registers/logs in default testuser_e2e
 *   E2E_PASSWORD      its password                           default Test@12345 (local/CI throwaway)
 *   CI                enables retries + blob reporter
 *   PW_CHROMIUM_PATH  optional Chromium binary override
 */
import * as path from 'path';

const env = process.env;

export const config = {
  /** The application under test. */
  baseURL: env.BASE_URL || 'http://localhost:8000',
  /** The backend-free static server playwright.mocked.config.ts targets. */
  mockedBaseURL: env.MOCKED_BASE_URL || env.BASE_URL || 'http://localhost:8010',

  /**
   * The e2e account. The defaults are a throwaway local/CI user that
   * global-setup registers itself; a shared deployment should set both
   * variables from a secret store instead.
   */
  credentials: {
    username: env.E2E_USERNAME || 'testuser_e2e',
    password: env.E2E_PASSWORD || 'Test@12345',
  },

  isCI: Boolean(env.CI),
  chromiumPath: env.PW_CHROMIUM_PATH || undefined,

  /** Where global-setup stores the session token every worker reuses. */
  authStatePath: path.join(__dirname, '..', 'auth-state.json'),

  /** Named waits, so a spec says "slow UI" rather than a magic number. */
  timeouts: {
    test: 30_000,
    /** An element the current action just caused (toast, row, badge). */
    short: 5_000,
    /** A view that has to fetch before it renders. */
    medium: 10_000,
    /** Cold start: first navigation, a run that seeds data. */
    long: 30_000,
  },
} as const;

export type Config = typeof config;
