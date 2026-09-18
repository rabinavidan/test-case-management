/**
 * Typed factory functions for every API response shape the serverless
 * mocked E2E specs (`e2e/tests/mocked-serverless-*.spec.ts`) fulfil via
 * `page.route()`. One place to look when the real backend's response shape
 * changes — see `e2e/mocks/schema-registry.ts` and
 * `e2e/tests/mock-contract-drift.spec.ts` for how that drift gets caught
 * automatically rather than discovered by a mocked test quietly testing
 * against a fiction.
 *
 * Field names/types are taken directly from the Pydantic response models in
 * shared/schemas.py and api/schemas.py — not guessed. Each factory takes a
 * `Partial<T>` of overrides so a test only has to state what it cares about.
 */

let idCounter = 1000;
function nextId(): number {
  idCounter += 1;
  return idCounter;
}

const NOW_ISO = '2026-01-01T00:00:00+00:00';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export function mockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId(),
    name: 'Mock Project',
    description: null,
    created_at: NOW_ISO,
    ...overrides,
  };
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export function mockProjectList(items: Project[] = [mockProject()]): PaginatedProjects {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20,
    total_pages: 1,
  };
}

export interface TestSuite {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export function mockSuite(overrides: Partial<TestSuite> = {}): TestSuite {
  return {
    id: nextId(),
    project_id: overrides.project_id ?? nextId(),
    name: 'Mock Suite',
    description: null,
    created_at: NOW_ISO,
    ...overrides,
  };
}

export interface TestCase {
  id: number;
  suite_id: number;
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  status: string;
  priority: string;
  created_at: string;
}

export function mockTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: nextId(),
    suite_id: overrides.suite_id ?? nextId(),
    title: 'Mock test case',
    description: null,
    steps: null,
    expected_result: null,
    status: 'draft',
    priority: 'medium',
    created_at: NOW_ISO,
    ...overrides,
  };
}

export interface TestResult {
  id: number;
  run_id: number;
  testcase_id: number;
  status: string;
  notes: string | null;
  executed_at: string | null;
  test_case: TestCase;
}

export function mockTestResult(overrides: Partial<TestResult> = {}): TestResult {
  const testCase = overrides.test_case ?? mockTestCase();
  return {
    id: nextId(),
    run_id: overrides.run_id ?? nextId(),
    testcase_id: testCase.id,
    status: 'pending',
    notes: null,
    executed_at: null,
    test_case: testCase,
    ...overrides,
  };
}

export interface TestRun {
  id: number;
  suite_id: number;
  name: string;
  created_at: string;
  completed_at: string | null;
  created_by_username: string | null;
  environment_key: string | null;
  environment_name: string | null;
  results: TestResult[];
}

export function mockRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: nextId(),
    suite_id: overrides.suite_id ?? nextId(),
    name: 'Mock Run',
    created_at: NOW_ISO,
    completed_at: null,
    created_by_username: 'mock_user',
    environment_key: null,
    environment_name: null,
    results: [],
    ...overrides,
  };
}

export interface AIGeneratedTestCase {
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  priority: string;
}

export function mockAIGeneratedTestCase(overrides: Partial<AIGeneratedTestCase> = {}): AIGeneratedTestCase {
  return {
    title: 'AI-generated test case',
    description: 'Generated description',
    steps: '1. Do the thing',
    expected_result: 'It works',
    priority: 'medium',
    ...overrides,
  };
}

export interface AIGenerateResponse {
  test_cases: AIGeneratedTestCase[];
  model: string;
}

export function mockAIGenerateResponse(overrides: Partial<AIGenerateResponse> = {}): AIGenerateResponse {
  return {
    test_cases: [mockAIGeneratedTestCase()],
    model: 'claude-haiku-4-5-20251001',
    ...overrides,
  };
}

export interface TriageResultItem {
  testcase_id: number;
  title: string;
  status: string;
  notes: string | null;
}

export function mockTriageResultItem(overrides: Partial<TriageResultItem> = {}): TriageResultItem {
  return {
    testcase_id: nextId(),
    title: 'Mock failing case',
    status: 'fail',
    notes: null,
    ...overrides,
  };
}

export interface TriageResponse {
  summary: string;
  problem_results: TriageResultItem[];
  model: string | null;
}

export function mockTriageResponse(overrides: Partial<TriageResponse> = {}): TriageResponse {
  return {
    summary: 'The failures share a common root cause.',
    problem_results: [mockTriageResultItem()],
    model: 'claude-haiku-4-5-20251001',
    ...overrides,
  };
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function mockUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: nextId(),
    username: 'mock_user',
    email: 'mock@example.com',
    role: 'admin',
    is_active: true,
    created_at: NOW_ISO,
    ...overrides,
  };
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

export function mockTokenResponse(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    access_token: 'mock-jwt-token',
    token_type: 'bearer',
    user: mockUser(),
    ...overrides,
  };
}
