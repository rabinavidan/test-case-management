import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { ProjectsPage } from '../pages/projects.page';

/**
 * Custom Cucumber World — one instance per scenario. See e2e-bdd/README.md
 * for why this suite keeps its own Page Objects instead of importing
 * ../e2e/pages.
 */
export class TestFlowWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  request!: APIRequestContext;

  authToken?: string;
  loginPage!: LoginPage;
  projectsPage!: ProjectsPage;

  /** Gherkin-literal project name -> the actual unique name used against the live backend. */
  projectNames = new Map<string, string>();
  createdProjectIds: number[] = [];

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(TestFlowWorld);
