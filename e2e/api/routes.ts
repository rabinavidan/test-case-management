/**
 * The only place in the e2e suite that knows the backend's URL layout.
 * A renamed route is a one-line change here, not a search through specs.
 */
export const routes = {
  login: '/api/auth/login',
  register: '/api/auth/register',
  projects: '/api/projects',
  project: (id: number) => `/api/projects/${id}`,
  projectSuites: (projectId: number) => `/api/projects/${projectId}/suites`,
  suite: (id: number) => `/api/suites/${id}`,
  suiteTestCases: (suiteId: number) => `/api/suites/${suiteId}/testcases`,
  suiteRuns: (suiteId: number) => `/api/suites/${suiteId}/runs`,
  runResult: (runId: number, testCaseId: number) => `/api/runs/${runId}/results/${testCaseId}`,
} as const;
