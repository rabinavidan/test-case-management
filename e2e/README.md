# TestFlow – Playwright TypeScript E2E Tests

End-to-end tests for the TestFlow Test Case Management app, written with [Playwright](https://playwright.dev/) and TypeScript.
This is the project's primary automation stack: fixture-based auth, a full Page Object Model, `test.step()`-annotated
specs, HTML/JSON reporting, and its own CI workflow (`pw-ts.yml`). A feature-equivalent suite also exists in
Python/pytest under [`../tests/e2e`](../tests/e2e) — see the [root README](../README.md#test-architecture) for how
the two stacks map to each other.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium firefox
```

## Running locally

The app must be running on `http://localhost:8000` before running tests:

```bash
# In the repo root, start the backend:
uvicorn api.main:app --reload

# Then in e2e/:
npm test                  # headless, all browsers
npm run test:headed       # headed Chromium
npm run test:ui           # interactive Playwright UI
npx playwright test --project=chromium   # single browser
```

## Running against production / staging

```bash
BASE_URL=https://test-case-management-omega.vercel.app npm test
```

## Structure

```
e2e/
├── fixtures/
│   └── auth.fixture.ts      # Extended test with authToken / authedRequest
├── pages/
│   ├── base.page.ts         # BasePage with navigate() + waitForNetworkIdle()
│   ├── login.page.ts        # Auth modal (sign-in form, error state)
│   ├── projects.page.ts     # Projects list page
│   ├── project.page.ts      # Project detail (suites + stats)
│   ├── suite.page.ts        # Suite detail (test cases + run creation)
│   └── run.page.ts          # Test run execution + summary
├── tests/
│   ├── login.spec.ts        # Sign-in modal: render, success, invalid credentials
│   ├── projects.spec.ts     # Project CRUD
│   ├── suites.spec.ts       # Suite CRUD
│   ├── testcases.spec.ts    # Test case CRUD
│   ├── runs.spec.ts         # Test run execution
│   ├── sidebar-progress-bar.spec.ts  # Sidebar pass-rate bar after a run
│   ├── contract.spec.ts     # Responses validated against /openapi.json (ajv) +
│   │                        #   property-based edge cases (fast-check)
│   └── api.spec.ts          # API-level tests (no browser) — includes paginated
│                            #   response assertions ({items, total, page, total_pages})
│                            #   and full CRUD flow covering analytics endpoint
├── global-setup.ts          # Registers e2e test user and saves auth token
├── global-teardown.ts       # Deletes leftover test projects by name prefix
├── playwright.config.ts
└── tsconfig.json
```

## Allure reporting

The `allure-playwright` reporter is registered in `playwright.config.ts` alongside HTML/JSON, writing results to
`allure-results/` on every run.

```bash
npm test                    # writes allure-results/ (and the html/json reports) as a side effect
npm run allure:generate     # allure-results/ -> allure-report/ (static HTML)
npm run allure:open         # serve allure-report/ locally
npm run allure:report       # generate + open in one step
```

Generating/opening the report requires the `allure` CLI (installed locally via the `allure-commandline`
devDependency) and a Java runtime on `PATH`. CI (`pw-ts.yml`) sets up Java, generates the report on every run, and
uploads it as the `allure-report-playwright-ts-<run id>` build artifact.

## Contract testing

`contract.spec.ts` validates real API responses against the app's own OpenAPI schema (`GET /openapi.json`) using
[ajv](https://ajv.js.org/) (JSON Schema, including strict RFC 3339 `date-time` via `ajv-formats`) and
[fast-check](https://fast-check.dev/) for property-based edge cases — the TypeScript counterpart to
[`tests/contract/test_openapi_contract.py`](../tests/contract/test_openapi_contract.py) (Schemathesis) on the
Python side. It has already found real bugs, not hypothetical ones:

- A CRUD-flow test validates every response — project, suite, test case, run, result, stats — against its declared
  schema, catching a case where a `datetime` serialization fix in `api/schemas.py` silently dropped
  `format: date-time` from the generated schema instead of preserving it.
- A property-based test (`fast-check`) generates extreme integer path params (outside SQLite's 64-bit `INTEGER`
  range) and asserts the API never crashes with a 5xx — the regression test for an `OverflowError` fixed with a
  dedicated exception handler in `api/main.py`.

## API pagination

`GET /api/projects` now returns a paginated envelope:

```json
{ "items": [...], "total": 42, "page": 1, "page_size": 50, "total_pages": 1 }
```

All tests unwrap `.items` before filtering or asserting length.
Query params: `?page=1&page_size=50&search=keyword`.

## New features covered by tests

| Feature | Where tested |
|---------|-------------|
| Auth modal (render / success / invalid credentials) | `login.spec.ts` |
| AI test case generation (`POST /api/suites/{id}/testcases/generate`) | `api.spec.ts` full CRUD flow |
| WebSocket live updates (`/ws/runs/{run_id}`) | run view in browser tests |
| Analytics endpoint (`GET /api/projects/{id}/analytics`) | `api.spec.ts` full CRUD flow |
| Paginated project list | `api.spec.ts`, `projects.spec.ts` |
| Sidebar pass-rate progress bar | `sidebar-progress-bar.spec.ts` |

## Claude Code – Playwright MCP

This project includes a [Playwright MCP](https://github.com/microsoft/playwright-mcp) server configured for Claude Code (`.claude/settings.json`). When you open a Claude Code session in the repo root, the `playwright` MCP server starts automatically and gives Claude live browser tools:

| Tool | What it does |
|------|-------------|
| `browser_navigate` | Open any URL in a headless Chromium |
| `browser_snapshot` | Get an accessibility snapshot of the current page |
| `browser_screenshot` | Capture a screenshot |
| `browser_click` / `browser_type` | Interact with elements |

**Typical use cases:**
- Ask Claude to navigate to `http://localhost:8000` and verify UI state before writing a test
- Let Claude take a screenshot to confirm a selector exists
- Use Claude to draft a new page object by inspecting the live app

The MCP server uses the Chromium pre-installed in the Claude Code remote environment (`/opt/pw-browsers/chromium`) and runs headless. To verify the server is active run `/mcp` inside a Claude Code session.

## CI

The `pw-ts.yml` GitHub Actions workflow runs on pushes to `main` affecting `e2e/`, `api/`, or `static/`, and on PRs. It starts the FastAPI app locally, runs all tests, generates the Allure report, and uploads both the Playwright HTML report and the Allure report as artifacts.
