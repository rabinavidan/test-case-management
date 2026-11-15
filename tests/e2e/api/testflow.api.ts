import type { APIRequestContext } from '@playwright/test';
import { ApiError, HttpClient } from './http-client';
import { routes } from './routes';
import type {
  Project, ProjectInput, ResultStatus, Run, RunInput, Suite, SuiteInput, TestCase, TestCaseInput,
} from '../data/types';

interface Page<T> {
  items: T[];
  total: number;
}

export class ProjectsApi {
  constructor(private readonly http: HttpClient, private readonly track: (id: number) => void) {}

  async create(input: ProjectInput): Promise<Project> {
    const project = await this.http.post<Project>(routes.projects, input);
    this.track(project.id);
    return project;
  }

  search(text: string): Promise<Page<Project>> {
    return this.http.get<Page<Project>>(routes.projects, { search: text });
  }

  /**
   * A project created through the UI has no id the test can see: look it up
   * by its (unique) name and register it for teardown like an API-made one.
   */
  async adoptByName(name: string): Promise<Project> {
    const { items } = await this.search(name);
    const project = items.find((p) => p.name === name);
    if (!project) throw new Error(`No project named "${name}" to adopt for cleanup`);
    this.track(project.id);
    return project;
  }

  delete(id: number): Promise<void> {
    return this.http.delete(routes.project(id));
  }
}

export class SuitesApi {
  constructor(private readonly http: HttpClient) {}

  create(projectId: number, input: SuiteInput): Promise<Suite> {
    return this.http.post<Suite>(routes.projectSuites(projectId), input);
  }

  delete(id: number): Promise<void> {
    return this.http.delete(routes.suite(id));
  }
}

export class TestCasesApi {
  constructor(private readonly http: HttpClient) {}

  create(suiteId: number, input: TestCaseInput): Promise<TestCase> {
    return this.http.post<TestCase>(routes.suiteTestCases(suiteId), input);
  }
}

export class RunsApi {
  constructor(private readonly http: HttpClient) {}

  create(suiteId: number, input: RunInput): Promise<Run> {
    return this.http.post<Run>(routes.suiteRuns(suiteId), input);
  }

  recordResult(runId: number, testCaseId: number, status: ResultStatus, notes?: string): Promise<unknown> {
    return this.http.put(routes.runResult(runId, testCaseId), { status, ...(notes ? { notes } : {}) });
  }
}

/**
 * Facade over the backend for test setup and teardown. Owns cleanup: every
 * project it creates (or adopts) is deleted by `dispose()`, which the `api`
 * fixture calls after each test — suites, cases and runs go with their
 * project, so specs never write an afterEach.
 */
export class TestFlowApi {
  readonly projects: ProjectsApi;
  readonly suites: SuitesApi;
  readonly testCases: TestCasesApi;
  readonly runs: RunsApi;

  private readonly createdProjectIds = new Set<number>();

  constructor(request: APIRequestContext, token: string) {
    const http = new HttpClient(request, token);
    this.projects = new ProjectsApi(http, (id) => this.createdProjectIds.add(id));
    this.suites = new SuitesApi(http);
    this.testCases = new TestCasesApi(http);
    this.runs = new RunsApi(http);
  }

  async dispose(): Promise<void> {
    for (const id of this.createdProjectIds) {
      try {
        await this.projects.delete(id);
      } catch (e) {
        // A test that deletes its own project (through the UI) leaves a 404 here.
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    }
    this.createdProjectIds.clear();
  }
}
