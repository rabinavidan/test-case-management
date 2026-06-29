# TestFlow – Playwright TypeScript E2E Tests

End-to-end tests for the TestFlow Test Case Management app, written with [Playwright](https://playwright.dev/) and TypeScript.

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
│   ├── projects.page.ts     # Projects list page
│   ├── project.page.ts      # Project detail (suites + stats)
│   ├── suite.page.ts        # Suite detail (test cases + run creation)
│   └── run.page.ts          # Test run execution + summary
├── tests/
│   ├── projects.spec.ts     # Project CRUD
│   ├── suites.spec.ts       # Suite CRUD
│   ├── testcases.spec.ts    # Test case CRUD
│   ├── runs.spec.ts         # Test run execution
│   └── api.spec.ts          # API-level tests (no browser) — includes paginated
│                            #   response assertions ({items, total, page, total_pages})
│                            #   and full CRUD flow covering analytics endpoint
├── global-setup.ts          # Registers e2e test user and saves auth token
├── global-teardown.ts       # Deletes leftover test projects by name prefix
├── playwright.config.ts
└── tsconfig.json
```

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
| AI test case generation (`POST /api/suites/{id}/testcases/generate`) | `api.spec.ts` full CRUD flow |
| WebSocket live updates (`/ws/runs/{run_id}`) | run view in browser tests |
| Analytics endpoint (`GET /api/projects/{id}/analytics`) | `api.spec.ts` full CRUD flow |
| Paginated project list | `api.spec.ts`, `projects.spec.ts` |

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

The `pw-ts.yml` GitHub Actions workflow runs on pushes to `main` affecting `e2e/`, `api/`, or `static/`, and on PRs. It starts the FastAPI app locally, runs all tests, and uploads the HTML report as an artifact.
