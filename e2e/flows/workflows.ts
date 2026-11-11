/**
 * Business workflows: the multi-step things a TestFlow user (or a test's
 * Arrange phase) does, named in domain language. Each composes page objects
 * or API calls; none asserts — a flow returns what the spec needs to check.
 *
 * UI flows exercise the feature under test. Seed flows (API) build the
 * preconditions fast, so a spec only drives the UI for the behaviour it is
 * actually about.
 */
import type { TestFlowApi } from '../api/testflow.api';
import type { TestFlowApp } from './app';
import { aRun, anActiveTestCase } from '../data/builders';
import type { ProjectInput, ResultStatus, Run, SuiteInput, TestCase, TestCaseInput } from '../data/types';

// ── UI workflows ────────────────────────────────────────────────────────────

export async function createProjectViaUi(app: TestFlowApp, input: ProjectInput): Promise<void> {
  await app.projects.goto();
  await app.projects.clickNewProject();
  await app.projects.fillProjectForm(input.name, input.description);
  await app.projects.submitProjectForm();
}

export async function createSuiteViaUi(app: TestFlowApp, projectId: number, input: SuiteInput): Promise<void> {
  await app.project.goto(projectId);
  await app.project.clickNewSuite();
  await app.project.fillSuiteForm(input.name, input.description);
  await app.project.submitSuiteForm();
}

export async function createTestCaseViaUi(app: TestFlowApp, suiteId: number, input: TestCaseInput): Promise<void> {
  await app.suite.goto(suiteId);
  await app.suite.clickNewTestCase();
  await app.suite.fillTestCaseForm(input);
  await app.suite.submitTestCaseForm();
}

export interface ResultEntry {
  status: ResultStatus;
  notes?: string;
}

/**
 * Starts a run from a suite and records one result per test case title,
 * leaving the browser on the run page. Returns the new run's id.
 */
export async function executeRunViaUi(
  app: TestFlowApp,
  suiteId: number,
  results: Record<string, ResultStatus | ResultEntry>,
  runName = aRun().name,
): Promise<number> {
  await app.suite.goto(suiteId);
  const runId = await app.suite.startRun(runName);
  await app.run.goto(runId);
  for (const [title, entry] of Object.entries(results)) {
    const { status, notes } = typeof entry === 'string' ? { status: entry, notes: undefined } : entry;
    await app.run.markResult(title, status, notes);
  }
  return runId;
}

// ── Seed workflows (API) ────────────────────────────────────────────────────

/** Adds one active test case per title to a suite. */
export async function seedTestCases(api: TestFlowApi, suiteId: number, titles: string[]): Promise<TestCase[]> {
  const created: TestCase[] = [];
  for (const title of titles) created.push(await api.testCases.create(suiteId, anActiveTestCase({ title })));
  return created;
}

/** A run of a suite with one result already recorded for one test case. */
export async function seedRunWithResult(
  api: TestFlowApi,
  suiteId: number,
  testCase: TestCase,
  status: ResultStatus,
  runName = aRun().name,
): Promise<Run> {
  const run = await api.runs.create(suiteId, { name: runName });
  await api.runs.recordResult(run.id, testCase.id, status);
  return run;
}
