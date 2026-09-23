# TestFlow – Playwright TypeScript E2E Tests

End-to-end tests for the TestFlow Test Case Management app, written with [Playwright](https://playwright.dev/) and TypeScript.
This is the project's primary automation stack: fixture-based auth, a full Page Object Model, `test.step()`-annotated
specs, Allure reporting, and its own CI workflow (`pw-ts.yml`). A feature-equivalent suite also exists in
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
│   ├── api.spec.ts          # API-level tests (no browser) — includes paginated
│   │                        #   response assertions ({items, total, page, total_pages})
│   │                        #   and full CRUD flow covering analytics endpoint
│   ├── mocked-serverless-crud.spec.ts         # Serverless: projects/suites/test cases CRUD
│   ├── mocked-serverless-ai-features.spec.ts  # Serverless: AI generate + triage
│   ├── mocked-serverless-errors.spec.ts       # Serverless: 5xx/network/429/401/malformed-data
│   └── mock-contract-drift.spec.ts            # Validates e2e/mocks/ against /openapi.json (real backend)
├── mocks/                   # Typed fixtures for the serverless specs — see "Serverless mocked E2E tests" below
├── global-setup.ts          # Registers e2e test user and saves auth token
├── global-teardown.ts       # Deletes leftover test projects by name prefix
├── serve-static.py          # Backend-free static server for the serverless specs
├── playwright.config.ts
├── playwright.mocked.config.ts
└── tsconfig.json
```

## Allure reporting

The `allure-playwright` reporter is registered in `playwright.config.ts` (alongside a JSON reporter CI's job
summary parses — no plain Playwright HTML reporter), writing results to `allure-results/` on every run.

```bash
npm test                    # writes allure-results/ (and test-results/results.json) as a side effect
npm run allure:generate     # allure-results/ -> allure-report/ (Allure's own static HTML report)
npm run allure:open         # serve allure-report/ locally
npm run allure:report       # generate + open in one step
```

Generating/opening the report requires the `allure` CLI (installed locally via the `allure-commandline`
devDependency) and a Java runtime on `PATH`. CI (`pw-ts.yml`) sets up Java, generates the report on every run, and
uploads it as the `allure-report-playwright-ts-<run id>` build artifact.

The serverless mocked suite (below) is Allure-instrumented the same way, with its own output directories so the two
suites never collide: `playwright.mocked.config.ts` registers `allure-playwright` writing to
`allure-results-mocked/`, and `npm run allure:generate:mocked` / `allure:open:mocked` / `allure:report:mocked`
mirror the commands above. CI (`pw-mocked-e2e.yml`) does the same generate-and-upload as `pw-ts.yml`.

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

## Serverless mocked E2E tests

`mocked-serverless-*.spec.ts` are a second, fully offline test layer: every backend call is intercepted with
Playwright's `page.route()` (no FastAPI process, no database, no network at all beyond the browser talking to a
static file server). They run under a separate config, `playwright.mocked.config.ts` — the default
`playwright.config.ts` can't be reused as-is because its `globalSetup`/`globalTeardown` perform a real
register+login HTTP round-trip, which would fail with no backend running.

```bash
# from e2e/
python3 serve-static.py 8010 &   # serves static/ the same way api/main.py's StaticFiles mount does
npm run test:mocked
```

Why a second layer, given `contract.spec.ts` and the rest of the real-backend suite already exist:

- **Speed and determinism.** No database seeding, no auth rate limits, no flakiness from a real server under load —
  every response is exactly what the test says it is.
- **Reachable error paths.** A 503 from the AI provider, a malformed JSON body, a 429 rate-limit response — these are
  awkward or impossible to trigger on demand against a live backend, but are one `page.route()` call here
  (`mocked-serverless-errors.spec.ts`, `mocked-serverless-ai-features.spec.ts`).

**The catch, and how it's covered.** A mocked test only proves the frontend handles the shape it's given — it can't
notice if the real backend's response shape has since changed. `e2e/mocks/factories.ts` is the single source of
truth for every mocked shape (field names taken directly from `shared/schemas.py`/`api/schemas.py`, not guessed),
and `mock-contract-drift.spec.ts` is what keeps it honest: it fetches the live `GET /openapi.json` and validates a
sample from every registered factory against its real schema with `ajv` — the same approach `contract.spec.ts`
already uses for real API responses, pointed at the mocks instead. Because it needs a real backend, it runs as part
of the existing real-backend suite (`pw-ts.yml`), not the serverless one (`pw-mocked-e2e.yml`) — see
`e2e/mocks/schema-registry.ts` for the fixture-to-schema mapping it checks.

A drift-spec failure means the backend's response shape changed and `e2e/mocks/factories.ts` needs a matching
update — a human or an agent does that (there is deliberately no automated fixer here, consistent with
[`docs/agent-governance.md`](../docs/agent-governance.md)'s stance that a human/agent reviews the failure rather
than an orchestrator silently patching it). The failure message names exactly which fixture and which `ajv`
validation errors, so the fix is a small, targeted diff.

```
e2e/mocks/
  factories.ts        — typed mock payload factories (Project, TestSuite, AIGenerateResponse, ...)
  route-helpers.ts     — fulfillJson / mockAuthSession / byPath helpers over page.route()
  schema-registry.ts   — maps each factory sample to its OpenAPI components.schemas key
e2e/tests/
  mocked-serverless-crud.spec.ts          — projects/suites/test cases CRUD
  mocked-serverless-ai-features.spec.ts   — AI generate + triage, including provider error paths
  mocked-serverless-errors.spec.ts        — generic 5xx/network/429/401/malformed-data edge cases
  mock-contract-drift.spec.ts             — the drift check described above (real backend, runs in pw-ts.yml)
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
| Auth modal (render / success / invalid credentials) | `login.spec.ts` |
| AI test case generation (`POST /api/suites/{id}/testcases/generate`) | `api.spec.ts` full CRUD flow |
| WebSocket live updates (`/ws/runs/{run_id}`) | run view in browser tests |
| Analytics endpoint (`GET /api/projects/{id}/analytics`) | `api.spec.ts` full CRUD flow |
| Paginated project list | `api.spec.ts`, `projects.spec.ts` |
| Sidebar pass-rate progress bar | `sidebar-progress-bar.spec.ts` |
| Suite CSV export (`GET /api/suites/{id}/export/csv`) | `suites.spec.ts` |

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

## Playwright Agents

Three of [Playwright's official agents](https://playwright.dev/docs/test-agents) — `playwright-test-planner`,
`playwright-test-generator`, `playwright-test-healer` — are wired up as Claude Code subagents
(`.claude/agents/*.md`, generated by `npx playwright init-agents --loop=claude`) backed by a dedicated
`playwright-test` MCP server (root [`.mcp.json`](../.mcp.json), pointed at this directory's
`playwright.config.ts`). They're an authoring/maintenance aid for this suite, not a new CI job — everything they
produce lands as ordinary `*.spec.ts` files here and runs through the existing `pw-ts.yml` pipeline once committed.

| Agent | What it does | Output |
|-------|--------------|--------|
| `playwright-test-planner` | Explores the running app in a real (headless) browser, writes a numbered test plan, and saves a structured record of the journey and elements it found (see below) | `specs/*.md` + `specs/*.context.json` |
| `playwright-test-generator` | Replays a plan's steps against the live app, recording real interactions, then writes a spec per scenario | `e2e/tests/*.spec.ts` |
| `playwright-test-healer` | Runs the suite, debugs any failure against the live app, and edits the spec to fix it — but only for locator/timing drift; a failure that looks like a real product defect is escalated, never silently skipped (see below) | edits existing `e2e/tests/*.spec.ts` |

**Usage** (from a Claude Code session in the repo root, with the app running on `http://localhost:8000`):

```
@playwright-test-planner   Plan test coverage for the projects and suites pages
@playwright-test-generator Generate tests for the plan in specs/<file>.md
@playwright-test-healer    Fix the failing tests in e2e/tests/
```

`e2e/tests/seed.spec.ts` is the environment the generator/healer start every scenario from — it logs in via
`fixtures/auth.fixture.ts` the same way every hand-written spec does, so generated tests inherit the same
authenticated starting point instead of a blank browser. It's excluded from the real suite via `playwright.config.ts`'s
`testIgnore` (it has no assertions of its own).

**Self-healing guardrails.** The healer classifies every failure before touching code: locator/timing drift
(the test's assumptions are stale — safe to auto-fix) vs. behavior change (the app itself looks like it's doing
something different — a suspected real defect). `test.fixme()` is forbidden for the latter; a behavior-change
failure is left failing with a labelled `// ESCALATED` comment instead of being silently skipped. Every healing
session — healed, escalated, or (locator/timing only, last resort) `test.fixme()`'d — is appended as one JSON
record to `heal-outcomes/heal_outcomes.jsonl`, the audit trail `scripts/heal_metrics.py` reads to compute
heal-success-rate and false-heal-rate (surfaced on the KPI dashboard once real sessions accumulate). See
[`.claude/agents/playwright-test-healer.md`](../.claude/agents/playwright-test-healer.md) for the full rule.

**Shared context artifact.** Course milestone M8. Every planner run used to be wasted effort for the other two
agents — the generator and healer each re-explored the same flow live rather than reusing what the planner had
already found. The planner now also saves `specs/<name>.context.json` alongside its `specs/<name>.md` plan: an
ordered `journey` of the pages/states it visited, and a catalog of `elements` it used, each captured by
**accessibility role + accessible name** from the browser snapshot rather than a CSS selector or XPath — see
[`scripts/context_artifact.py`](../scripts/context_artifact.py) for the schema. The generator reads it before
replaying a plan's steps, using its recorded locators as the first choice instead of re-deriving them; the healer
reads it (via the failing spec's `// spec: specs/<name>.md` header comment) as a fast reference for what a flow's
elements looked like when the plan was written, a concrete signal for the locator-drift-vs-behavior-change call in
its self-healing guardrails above. No artifact for a given spec (an older one, or a hand-authored plan) — both
agents fall back to live exploration exactly as before; the artifact is a shortcut when available, never a
requirement.

Generated specs still need the same review as a hand-written PR — check they use the Page Object Model
(`pages/*.page.ts`) and `data-testid` locators like the rest of this directory rather than ad hoc selectors, since
the agent records against the live DOM and won't know those conventions on its own.

## CI

The `pw-ts.yml` GitHub Actions workflow runs on pushes to `main` affecting `e2e/`, `api/`, or `static/`, and on PRs. It starts the FastAPI app locally, runs all tests, generates the Allure report, and uploads it as an artifact.

`pw-mocked-e2e.yml` runs the serverless `mocked-serverless-*.spec.ts` suite separately: no `pip install`, no FastAPI, no database — just `npm ci`, `serve-static.py`, and `npm run test:mocked`. It's scoped (via `paths:`) to only fire when the mocks, those specs, or `static/` itself change, so it doesn't run on every unrelated backend PR.
