/**
 * Test-data builders: every spec asks for "a project" / "an active test
 * case" and overrides only the fields its scenario is about, so a spec reads
 * as the business rule it checks rather than as a request payload.
 */
import type { ProjectInput, RunInput, SuiteInput, TestCaseInput } from './types';

/**
 * Every project the layered specs create starts with this, so
 * global-teardown.ts can sweep leftovers from a crashed run (on a shared
 * deployment) without touching anything a person created.
 */
export const E2E_NAME_PREFIX = 'E2E ';

/**
 * Unique per call, across parallel workers: Date.now() alone repeats when two
 * workers start in the same millisecond, so a random suffix is appended.
 */
export function uniqueName(base: string): string {
  return `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const aProject = (overrides: Partial<ProjectInput> = {}): ProjectInput => ({
  name: uniqueName(`${E2E_NAME_PREFIX}Project`),
  description: 'Created by the e2e suite',
  ...overrides,
});

export const aSuite = (overrides: Partial<SuiteInput> = {}): SuiteInput => ({
  name: uniqueName('Suite'),
  description: 'Created by the e2e suite',
  ...overrides,
});

export const anActiveTestCase = (overrides: Partial<TestCaseInput> = {}): TestCaseInput => ({
  title: uniqueName('Test Case'),
  priority: 'medium',
  status: 'active',
  ...overrides,
});

export const aRun = (overrides: Partial<RunInput> = {}): RunInput => ({
  name: uniqueName('Run'),
  ...overrides,
});
