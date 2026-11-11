/**
 * Domain vocabulary shared by every test layer (api/, pages/, flows/, specs).
 *
 * These are the shapes the *tests* reason about, not a copy of the backend's
 * schemas: only the fields a test reads or writes are listed. Contract
 * accuracy is tests/contract's and mock-contract-drift.spec.ts's job.
 */
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TestCaseStatus = 'active' | 'draft' | 'deprecated';
export type ResultStatus = 'pass' | 'fail' | 'skip';
export type RunTileStatus = ResultStatus | 'pending';

export interface Project {
  id: number;
  name: string;
  description?: string | null;
}

export interface Suite {
  id: number;
  name: string;
  description?: string | null;
}

export interface TestCase {
  id: number;
  title: string;
  description?: string | null;
  priority?: Priority;
  status?: TestCaseStatus;
}

export interface Run {
  id: number;
  name: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
}

export interface SuiteInput {
  name: string;
  description?: string;
}

export interface TestCaseInput {
  title: string;
  description?: string;
  steps?: string;
  expected?: string;
  priority?: Priority;
  status?: TestCaseStatus;
}

export interface RunInput {
  name: string;
}
