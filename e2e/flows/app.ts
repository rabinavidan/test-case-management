import type { Page } from '@playwright/test';
import { ProjectsPage } from '../pages/projects.page';
import { ProjectPage } from '../pages/project.page';
import { SuitePage } from '../pages/suite.page';
import { RunPage } from '../pages/run.page';

/**
 * One handle on every screen of the signed-in app, so a spec or flow asks
 * for `app.suite` instead of constructing page objects itself.
 */
export class TestFlowApp {
  readonly projects: ProjectsPage;
  readonly project: ProjectPage;
  readonly suite: SuitePage;
  readonly run: RunPage;

  constructor(readonly page: Page) {
    this.projects = new ProjectsPage(page);
    this.project = new ProjectPage(page);
    this.suite = new SuitePage(page);
    this.run = new RunPage(page);
  }
}
