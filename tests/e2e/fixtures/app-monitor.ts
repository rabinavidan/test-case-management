/**
 * Monitoring engine + recovery, per test.
 *
 * Classic frameworks had "recovery scenarios": handlers that closed an
 * unexpected popup and resumed the script. Playwright makes most of that
 * unnecessary — every test gets a fresh browser context (nothing leaks
 * between tests), actions auto-wait, CI retries once, and fixtures clean up
 * even when a test throws. What still matters is *noticing* when the app
 * itself misbehaves while a test happens to pass, and explaining a failure
 * without re-running it. That is this fixture:
 *
 *   - uncaught JavaScript errors in the page (`pageerror`) fail the test —
 *     a screen can render correctly and still have thrown;
 *   - every 5xx response and every failed request (DNS, reset, CORS) is
 *     recorded;
 *   - on failure, everything recorded is attached to the report as
 *     `app-monitor.json` next to the trace, screenshot and video.
 */
import type { Page, TestInfo } from '@playwright/test';

export interface AppEvent {
  kind: 'pageerror' | 'http-5xx' | 'requestfailed';
  at: string;
  detail: string;
}

export class AppMonitor {
  readonly events: AppEvent[] = [];

  constructor(page: Page) {
    page.on('pageerror', (err) => this.record('pageerror', `${err.name}: ${err.message}`));
    page.on('response', (res) => {
      if (res.status() >= 500) this.record('http-5xx', `${res.status()} ${res.request().method()} ${res.url()}`);
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText ?? 'unknown';
      // Navigations and teardown cancel in-flight requests; that is not an app fault.
      if (/aborted|cancelled/i.test(failure)) return;
      this.record('requestfailed', `${failure} ${req.method()} ${req.url()}`);
    });
  }

  get uncaughtErrors(): AppEvent[] {
    return this.events.filter((e) => e.kind === 'pageerror');
  }

  async attachTo(testInfo: TestInfo): Promise<void> {
    if (!this.events.length) return;
    await testInfo.attach('app-monitor.json', {
      body: JSON.stringify(this.events, null, 2),
      contentType: 'application/json',
    });
  }

  private record(kind: AppEvent['kind'], detail: string): void {
    this.events.push({ kind, at: new Date().toISOString(), detail });
  }
}
