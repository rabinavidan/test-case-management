/**
 * Maps every mock fixture in `e2e/mocks/factories.ts` to the OpenAPI
 * `components.schemas` entry it's supposed to match. Read only by
 * `e2e/tests/mock-contract-drift.spec.ts` — the mocked-serverless specs
 * themselves never import this file, only `factories.ts` directly.
 */
import {
  mockAIGenerateResponse,
  mockProject,
  mockProjectList,
  mockRun,
  mockSuite,
  mockTestCase,
  mockTestResult,
  mockTokenResponse,
  mockTriageResponse,
  mockUser,
} from './factories';

export interface DriftCheckEntry {
  /** The exact key under the live OpenAPI schema's `components.schemas`. */
  schemaName: string;
  /** A representative payload built from the same factory the mocked specs use. */
  sample: unknown;
}

export const FIXTURE_SCHEMA_REGISTRY: DriftCheckEntry[] = [
  { schemaName: 'ProjectResponse', sample: mockProject() },
  { schemaName: 'PaginatedProjects', sample: mockProjectList() },
  { schemaName: 'TestSuiteResponse', sample: mockSuite() },
  { schemaName: 'TestCaseResponse', sample: mockTestCase() },
  { schemaName: 'TestRunResponse', sample: mockRun() },
  { schemaName: 'TestResultResponse', sample: mockTestResult() },
  { schemaName: 'AIGenerateResponse', sample: mockAIGenerateResponse() },
  { schemaName: 'TriageResponse', sample: mockTriageResponse() },
  { schemaName: 'UserResponse', sample: mockUser() },
  { schemaName: 'TokenResponse', sample: mockTokenResponse() },
];
