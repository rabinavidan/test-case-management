import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { TestFlowWorld } from './world';
import { RunPage, ResultStatus } from '../pages/run.page';
import { BASE_URL } from './hooks';

/** POST /graphql as the signed-in user; fails the step on any GraphQL error. */
async function gql(world: TestFlowWorld, query: string, variables: Record<string, unknown> = {}) {
  const res = await world.request.post('/graphql', {
    data: { query, variables },
    headers: { Authorization: `Bearer ${world.authToken}` },
  });
  const body = await res.json();
  if (body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function testCaseId(world: TestFlowWorld, title: string): string {
  const id = world.testCaseIds.get(title);
  if (!id) throw new Error(`No test case titled "${title}" in this scenario's run`);
  return id;
}

Given('a run with test cases {string} and {string} exists', async function (this: TestFlowWorld, first: string, second: string) {
  const uid = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const { createProject } = await gql(this, 'mutation($n: String!) { createProject(input: {name: $n}) { id } }', { n: `BDD Live ${uid}` });
  this.createdProjectIds.push(Number(createProject.id));
  const { createSuite } = await gql(this, 'mutation($p: ID!) { createSuite(projectId: $p, input: {name: "Live Suite"}) { id } }', { p: createProject.id });
  for (const title of [first, second]) {
    const { createTestCase } = await gql(this,
      'mutation($s: ID!, $t: String!) { createTestCase(suiteId: $s, input: {title: $t, status: ACTIVE}) { id } }',
      { s: createSuite.id, t: title });
    this.testCaseIds.set(title, createTestCase.id);
  }
  const { createRun } = await gql(this, 'mutation($s: ID!) { createRun(suiteId: $s, input: {name: "BDD Live Run"}) { id } }', { s: createSuite.id });
  this.runId = createRun.id;
});

Given('I have the run open', async function (this: TestFlowWorld) {
  await new RunPage(this.page).goto(this.runId!);
});

Given('a teammate has the same run open', async function (this: TestFlowWorld) {
  this.teammateContext = await this.browser.newContext({ baseURL: BASE_URL });
  await this.teammateContext.addInitScript((token) => window.localStorage.setItem('tf_token', token as string), this.authToken);
  this.teammatePage = await this.teammateContext.newPage();
  await new RunPage(this.teammatePage).goto(this.runId!);
});

When('the teammate records {string} as {string}', async function (this: TestFlowWorld, title: string, status: string) {
  await new RunPage(this.teammatePage!).record(testCaseId(this, title), status as ResultStatus);
});

When('{string} is recorded as {string} through the GraphQL API', async function (this: TestFlowWorld, title: string, status: string) {
  await gql(this,
    'mutation($r: ID!, $t: ID!, $s: ResultStatus!) { updateResult(runId: $r, testCaseId: $t, input: {status: $s}) { id } }',
    { r: this.runId, t: testCaseId(this, title), s: status });
});

Then('I see {string} marked as {string} without reloading', async function (this: TestFlowWorld, title: string, label: string) {
  const navigations: string[] = [];
  this.page.on('framenavigated', (f) => { if (f === this.page.mainFrame()) navigations.push(f.url()); });
  await expect(new RunPage(this.page).statusBadge(testCaseId(this, title))).toHaveText(label, { timeout: 10_000 });
  expect(navigations).toEqual([]);
});

Then('I still see {string} marked as {string}', async function (this: TestFlowWorld, title: string, label: string) {
  await expect(new RunPage(this.page).statusBadge(testCaseId(this, title))).toHaveText(label);
});

Then('the GraphQL run summary shows {int} passed, {int} failed and a {int}% pass rate',
  async function (this: TestFlowWorld, passed: number, failed: number, rate: number) {
    const { run } = await gql(this, 'query($r: ID!) { run(id: $r) { summary { passed failed passRate } } }', { r: this.runId });
    expect(run.summary).toEqual({ passed, failed, passRate: rate });
  });

Then('the run is marked completed', async function (this: TestFlowWorld) {
  const { run } = await gql(this, 'query($r: ID!) { run(id: $r) { completedAt } }', { r: this.runId });
  expect(run.completedAt).not.toBeNull();
});
