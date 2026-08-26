# TestFlow — Test Case Management

A full-stack test case management platform built with FastAPI microservices, Vanilla JS, PostgreSQL, and Redis.
Designed to demonstrate cutting-edge engineering practices — microservice decomposition, event-driven async, real-time WebSocket collaboration, and AI-powered test generation.

---

## Features

### Core workflow
- **Projects → Suites → Test Cases → Runs → Results** — complete test lifecycle management
- Paginated project listing with search (`?page=&page_size=&search=`)
- Priority levels (Critical / High / Medium / Low) and status labels (Active / Draft)
- Per-result run notes and pass / fail / skip marking

### Cutting-edge additions

| Feature | Tech | Endpoint / File |
|---------|------|----------------|
| **AI Test Generation** | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) | `POST /api/suites/{id}/testcases/generate` |
| **Real-time Collaboration** | WebSocket + Redis Pub/Sub | `WS /ws/runs/{run_id}` |
| **Analytics Dashboard** | Chart.js 4 (pass-rate trend line, suite coverage bars) | `GET /api/projects/{id}/analytics` |
| **Microservice Architecture** | 5 services · Docker Compose · Redis events | `services/` + `docker-compose.microservices.yml` |
| **Structured Logging** | Middleware logging every HTTP request with status and latency_ms; microservice mode also threads a correlation `request_id` across every service | `api/main.py` · `services/common/request_id.py` |
| **Paginated API** | Envelope `{items, total, page, page_size, total_pages}` | `GET /api/projects` |

---

## Architecture

Two deployment modes are supported. The public URL surface (`/api/*`, `/ws/*`) is identical in both.

### Microservice mode *(recommended)*

```
Browser (Vanilla JS SPA)
  │  HTTP / REST + WebSocket
  ▼
┌─────────────────────────────────────────────────────────┐
│  Gateway  :8000  (httpx proxy · static file serving)    │
└──┬──────────┬──────────┬──────────────────────────┬─────┘
   │          │          │                          │
   ▼          ▼          ▼                          ▼
Auth:8001  Projects:8002  Runs:8003            AI:8004
JWT login  CRUD + stats  Runs + results        Claude Haiku
users      analytics     WebSocket             test generation
           demo seed     Redis pub/sub
               │              │
               └──────┬───────┘
                      ▼
               PostgreSQL 16 (one shared instance, table-prefixed per service)
               ├─ auth_users
               ├─ projects_projects, projects_test_suites, projects_test_cases
               └─ runs_test_runs, runs_test_results

               Redis 7
               └─ channel: runs.completed  (async event pub/sub)
```

**Key design decisions:**
- JWT embeds `role` claim — non-auth services verify tokens locally (no auth round-trip per request)
- Synchronous HTTP (httpx) for tight coupling: runs ↔ projects for test case lookup
- Redis Pub/Sub for fire-and-forget `run.completed` events; degrades gracefully if Redis is down
- Gateway is a thin proxy — frontend requires zero changes vs. the monolith

### Monolith mode *(original · still works)*

```
Browser (SPA)
  │  HTTP / REST + WebSocket
  ▼
FastAPI (api/main.py) — single process
  ├─ JWT auth middleware
  ├─ ConnectionManager (WebSocket broadcast)
  ├─ /api/suites/{id}/testcases/generate  ──► Anthropic Claude Haiku API
  └─ SQLAlchemy ORM
       ├─ PostgreSQL (Neon · production)
       └─ SQLite (/tmp · local dev / Vercel)
```

---

## Quick start

### Microservice mode (Docker Compose + Postgres + Redis)

```bash
cp .env.example .env   # set JWT_SECRET_KEY and ANTHROPIC_API_KEY
docker compose -f docker-compose.microservices.yml up --build
# open http://localhost:8000
```

### Monolith mode (local dev — SQLite)

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
# open http://localhost:8000
```

### Monolith mode (Docker Compose + Postgres)

```bash
cp .env.example .env
docker compose up --build
# open http://localhost:8000
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | SQLite `/tmp/testflow.db` | Postgres URL for production |
| `JWT_SECRET_KEY` | `change-me-in-production` | HS256 signing secret |
| `ANTHROPIC_API_KEY` | *(empty)* | Required for AI test generation |
| `REDIS_URL` | `redis://localhost:6379` | Used by Runs service (microservice mode) |

---

## API reference (key endpoints)

All endpoints are identical regardless of deployment mode (monolith or microservices).

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/projects?page=1&page_size=50&search=
POST   /api/projects
DELETE /api/projects/{id}
GET    /api/projects/{id}/stats
GET    /api/projects/{id}/analytics

GET    /api/projects/{id}/suites
POST   /api/projects/{id}/suites

GET    /api/suites/{id}/testcases
POST   /api/suites/{id}/testcases
POST   /api/suites/{id}/testcases/generate      # AI generation (→ AI service)
POST   /api/suites/{id}/testcases/generate/save # Bulk save AI results

POST   /api/suites/{id}/runs
GET    /api/suites/{id}/runs
GET    /api/runs/{id}
PUT    /api/runs/{id}/results/{testcase_id}

WS     /ws/runs/{run_id}                        # Real-time result updates
```

---

## Test Architecture

### Test types at a glance

| Type | What it checks | Where |
|------|-----------------|-------|
| **Unit** | Pure functions (JWT/hash logic) — no DB, no HTTP, no I/O | `tests/unit/` (pytest) |
| **API / integration** | Real FastAPI app + real (throwaway, per-test) SQLite DB, via `TestClient` | `tests/api/` (pytest) |
| **Contract** | Real responses validated against the app's own live OpenAPI schema — property-based edge cases, not just hand-picked examples | `tests/contract/` (pytest + Schemathesis) · `e2e/tests/contract.spec.ts` (Playwright + ajv + fast-check) |
| **Microservices** | Each of the 5 `services/` (auth, projects, runs, ai, gateway) tested in isolation — auth, CRUD, inter-service HTTP calls, graceful degradation when a downstream service or Redis is unreachable | `tests/services/` (pytest) |
| **E2E / browser** | Full user flows through the real UI in a real browser, against a running instance of the app | `tests/e2e/` (pytest + Playwright) · `e2e/tests/*.spec.ts` (Playwright + TypeScript) · `java-e2e/` (JUnit 5 + Playwright Java) |
| **Java API** | Black-box HTTP tests against a running instance — no in-process shortcuts, same public `/api/*` surface as every other stack | `java-tests/` (JUnit 5 + REST Assured) |
| **Regression** | Cross-layer tag (`-m regression`) for a scheduled full-suite run against a live deployment | `pytest.ini` marker, run by `pw-regression.yml` / `pw-scheduled.yml` |
| **Reporting** | Allure report (history, retries, step-by-step detail) generated from every run in CI | `allure-pytest` (Python) · `allure-playwright` (TypeScript) · `allure-junit5` (Java) |

209 pytest tests total (7 unit + 112 API + 31 contract operations + 59 services), plus 40+ Playwright E2E specs,
35 JUnit 5/REST Assured API tests, and a JUnit 5/Playwright-Java E2E suite — four independent automation stacks
(Python, TypeScript, and two in Java) against the same app. See the breakdown below for how each stack is built.

This project deliberately maintains **three independent, feature-equivalent browser-automation stacks** against the
same app — Playwright + TypeScript, Playwright + pytest (Python), and Playwright + Java (JUnit 5) — rather than
picking one. All three drive the same UI through a Page Object Model and cover the same core user flows (auth,
projects, suites, test cases, runs); the TypeScript and Python stacks run in CI on every PR, and stay in parity with
each other as new coverage is added (e.g. `login.spec.ts` / `test_login_e2e.py`, the sidebar pass-rate bar). A
fourth stack, JUnit 5 + REST Assured (`java-tests/`), covers the same API surface again as pure black-box HTTP
tests — see [below](#java--rest-assured-suite).

| | Playwright · TypeScript | Playwright · Python (pytest) | Playwright · Java (JUnit 5) |
|---|---|---|---|
| Location | [`e2e/`](e2e/README.md) | `tests/e2e/` | [`java-e2e/`](java-e2e/README.md) |
| Run with | `npm test` (`@playwright/test` runner) | `pytest tests/e2e -m regression` (`pytest-playwright`) | `mvn test` |
| Page Object Model | `e2e/pages/*.page.ts` | `tests/e2e/pages/*_page.py` | `java-e2e/.../pages/*.java` |
| Auth strategy | fixture-based token injection (`fixtures/auth.fixture.ts`) + a dedicated UI modal spec (`login.spec.ts`) | page-object login flow (`test_login_e2e.py`) | token injection (`BaseTest.signInAs`) + a dedicated UI modal spec (`LoginTest`) |
| Structured step logging | `logger.ts` (`log.step/action/assert`) | `logger.py` (`PWLogger`) | — |
| CI workflow | `.github/workflows/pw-ts.yml` — every PR / push to `main` touching `e2e/`, `api/`, `static/` | `.github/workflows/test.yml`, `pw-scheduled.yml`, `pw-regression.yml` | `.github/workflows/java-e2e-tests.yml` — every PR / push to `main` touching `java-e2e/`, `api/`, `static/` |

The TypeScript and Python stacks get equal billing below — same depth of detail, same structure — since each
targets a different hiring context (Playwright/TypeScript roles vs. pytest/Python roles) and both are meant to
stand on their own. The Java stacks (both `java-e2e/` and `java-tests/`) target a third hiring context —
JUnit/Playwright/REST Assured roles — the same way; see their own READMEs for the same level of detail.

### Python · pytest suite

The Python side is further split into the classic pyramid — narrow and fast at the bottom, broad and slow at the
top — as five physically separate pytest layers under `tests/`.

```
tests/
├── conftest.py     # shared failure-logging hook + auto layer-marking (unit/api/contract/services/e2e)
├── unit/           # 7 tests   — pure functions, no DB/HTTP/I-O               (~1s total)
├── api/            # 112 tests — FastAPI TestClient against an in-memory DB   (~30s total)
│   └── conftest.py #   per-test SQLite engine + admin/executor auth fixtures
├── contract/       # 1 property-based suite (31 operations) — Schemathesis vs. the OpenAPI schema (~10s)
├── services/       # each services/ microservice in isolation, via TestClient   (~7s total)
│   └── conftest.py #   per-service SQLite engine + JWT minting
└── e2e/            # 40+ tests — Playwright browser + deployed-instance API   (minutes; needs a running app)
    └── pages/      #   Page Object Model — locators isolated from test logic
```

**Engineering practices this demonstrates:**

- **Isolation over mocking-everything.** API tests hit the real FastAPI app and a real (but throwaway, per-test) SQLite database via `app.dependency_overrides` — so they verify actual SQLAlchemy behavior, not a stubbed-out fake, while staying hermetic and parallelizable.
- **Mock the true external boundary, not your own code.** `tests/api/test_ai_generate.py` monkeypatches `anthropic.Anthropic` so AI-generation tests are deterministic and free, without ever faking the FastAPI/Pydantic layers around it.
- **The same contract tested at two altitudes on purpose.** JWT/password logic is verified as pure functions in `tests/unit/test_auth_tokens.py` *and* through real HTTP status codes in `tests/api/test_auth.py` — a failure in the unit layer localizes to the algorithm; a failure only in the API layer points at the wiring (dependency injection, route guards) instead.
- **Auto-tagged layers, not hand-maintained markers.** A `pytest_collection_modifyitems` hook in the root `conftest.py` tags every test with `unit`/`api`/`contract`/`services`/`e2e` from its file path, so `pytest -m api` works regardless of which paths you point pytest at — no per-test `@pytest.mark` upkeep.
- **Contract tests, not just example-based ones.** `tests/contract/test_openapi_contract.py` uses Schemathesis to property-test every operation in the app's own OpenAPI schema — generating edge-case inputs per endpoint rather than a handful of hand-picked ones. It already earned its place: it caught response `datetime` fields serializing without a UTC offset (fixed via a shared `UTCDatetime` type, now in `shared/schemas.py` and used by every service — see its docstring) and out-of-`SQLite-INTEGER`-range path params crashing with an unhandled `OverflowError` instead of a clean 4xx (fixed with a dedicated exception handler in `api/main.py`) — real bugs, not hypothetical ones, one of them found on a *later* run after Hypothesis explored a different input (an explicit `null` for a non-nullable field crashing response serialization in `PUT /api/testcases/{tc_id}`, fixed in `api/main.py`).
- **Coverage for the architecture the README calls "recommended" — not just the monolith.** `tests/services/` had zero prior coverage of `services/` (the 5-service microservices deployment) and immediately found a critical, previously-undetected bug: identical JWT-padding math (`"=" * (4 - len(s) % 4) % 4`, wrong operator precedence) duplicated across *five* files, crashing every authenticated request across the entire microservices deployment with a raw `TypeError` — fixed in all five. It also caught the gateway proxy silently misrouting `/api/suites/{id}/runs` to the projects service instead of runs (fixed in `services/gateway/main.py`), and directly validates the services README's claim that events "degrade gracefully if Redis is down" by calling the publisher with no Redis reachable — true by construction in this environment, not asserted from documentation.
- **Page Object Model** for the browser layer (`tests/e2e/pages/`): locators, `data-testid` selection strategy, and modal/toast helpers live in page classes, never inline in test bodies.
- **Structured step logging.** `tests/e2e/logger.py` (`PWLogger`) prints a `step/action/assert` trace for every test, so a CI log reads like a script, not a wall of framework noise.
- **Allure reporting.** `allure-pytest` (wired via `--alluredir`) turns every test run into a browsable Allure report — history, retries, timeline and step-by-step detail — generated in CI (`test.yml`) and uploaded as a build artifact.
- **CI runs the right layer at the right cadence** (see below) — fast layers gate every PR, browser E2E runs after deploy, full regression runs on a schedule.

```bash
pip install -r requirements.txt -r requirements-test.txt

pytest tests/unit -v                                     # unit layer only — milliseconds, no setup
pytest tests/unit tests/api tests/contract tests/services -v   # what CI runs on every PR
pytest tests/services -v                                 # microservices layer only
pytest tests/e2e/test_e2e.py --base-url=https://your-app.vercel.app -v   # browser E2E
pytest tests/ -m regression --base-url=https://your-app.vercel.app -v   # full regression suite

pytest tests/unit tests/api --alluredir=allure-results   # write Allure results
allure generate allure-results --clean -o allure-report && allure open allure-report
```

### TypeScript · Playwright suite

The TypeScript side (`e2e/`) is a single, flat spec layer — every spec drives the real browser against a running
instance of the app, backed by a shared Page Object Model and an auth fixture.

```
e2e/
├── fixtures/auth.fixture.ts   # authToken / authedRequest — one login, reused by every spec
├── pages/                     # BasePage + one *.page.ts per screen (POM, data-testid locators)
├── tests/                     # login · projects · suites · testcases · runs · sidebar-progress-bar · contract · api
├── global-setup.ts            # registers the e2e user once, saves the auth token to disk
└── global-teardown.ts         # deletes leftover test projects by name prefix
```

**Engineering practices this demonstrates:**

- **Fixture-based auth, not per-test login.** `fixtures/auth.fixture.ts` extends Playwright's base `test` with an `authToken` fixture read once from `global-setup.ts` — specs inject it via `localStorage`/`Authorization` header instead of repeating a login flow.
- **UI coverage isn't skipped just because auth is API-driven.** `login.spec.ts` still exercises the real sign-in modal end-to-end (render, success, invalid credentials) as its own unauthenticated spec, so the fixture's shortcut never leaves the actual login UI untested.
- **Page Object Model** (`pages/*.page.ts`): every page extends a shared `BasePage`, locators use the `data-testid` strategy exclusively, and `test.step()` annotates each action for readable traces.
- **Multi-browser by default.** Chromium and Firefox run on every pass; WebKit is opt-in (`--project=webkit`) rather than slowing down the default run.
- **Failure artifacts, not guesswork.** Trace, video and screenshot are captured `on-failure` only — full repro evidence without paying the cost on green runs.
- **Structured step logging.** `logger.ts` mirrors the Python suite's `PWLogger` output format 1:1, so both stacks read the same way in CI logs.
- **Allure reporting.** The `allure-playwright` reporter is registered alongside HTML/JSON in `playwright.config.ts`; every run produces a full Allure report (steps, attachments, history), generated in CI (`pw-ts.yml`) and uploaded as a build artifact.
- **Contract tests, not just example-based ones.** `contract.spec.ts` validates real responses against the app's own `/openapi.json` with `ajv`, and property-tests extreme path-param values with `fast-check` — the TypeScript counterpart to the Python side's Schemathesis suite. It caught a real bug of its own: a `datetime` fix on the Python side had silently dropped `format: date-time` from the generated schema instead of preserving it.
- **CI posts a live report, not just a badge.** `pw-ts.yml` parses the JSON reporter output into a pass/fail/flaky job-summary table on every run.

```bash
cd e2e && npm install
npx playwright install chromium firefox
npm test                                      # headless, chromium + firefox
npm run test:headed                           # headed chromium, for debugging
BASE_URL=https://your-app.vercel.app npm test # against staging

npm run allure:report                         # generate + open the Allure report
```

See [`e2e/README.md`](e2e/README.md) for the full breakdown.

### Java · REST Assured suite

The Java side (`java-tests/`) is a fourth, independent stack — black-box HTTP tests against a
**running instance** of the app, written the way a Java QA engineer would test any deployed
service, with no in-process shortcuts. It targets a different hiring context again (JUnit/REST
Assured roles), rounding out the project's automation coverage across Python, TypeScript and Java.

```
java-tests/
├── pom.xml
└── src/test/java/com/testflow/api/
    ├── support/                # REST Assured config, bootstrap-admin auth, unique naming
    ├── AuthApiTest.java        # login/me/token validation
    ├── ProjectsApiTest.java    # CRUD, pagination envelope, admin-only writes
    ├── SuitesApiTest.java      # CRUD, 404s, admin-only writes
    ├── TestCasesApiTest.java   # CRUD, defaults, the null-vs-omitted-field regression
    ├── RunsApiTest.java        # run creation, pending-result seeding, auto-completion
    └── UsersApiTest.java       # admin user management, self-delete guard
```

**Engineering practices this demonstrates:**

- **True black-box testing.** Every test is a real HTTP call via REST Assured against a running
  server — no `TestClient`, no dependency overrides — so it exercises the exact same public
  contract a real API consumer (or the other two stacks) would hit, monolith or microservices.
- **A single shared bootstrap-admin convention across stacks.** `POST /api/auth/register` only
  ever succeeds for the very first user on a given database. `AuthSupport` uses the same
  register-then-login fallback and the same fixed bootstrap credentials as
  [`e2e/global-setup.ts`](e2e/global-setup.ts), so this suite, the TypeScript suite, and a human
  using the app can all run against one live instance without racing to become the first user.
- **Collision-safe by construction.** Every project/suite/test-case name is UUID-suffixed
  (`TestData.uniqueName`), so the suite is safe to run repeatedly against a persistent database
  (SQLite/Postgres), not just a throwaway one.
- **Regression coverage carried over from the Python suite.** `TestCasesApiTest` re-asserts the
  explicit-`null`-doesn't-clear-a-non-nullable-field fix documented in `api/main.py`'s
  `update_testcase`, so the same real bug the contract suite caught stays covered here too.
- **Allure reporting**, via `allure-junit5` + `allure-rest-assured`, in the same format the
  Python and TypeScript stacks already produce.

```bash
# app must be running first (see Quick start above)
cd java-tests
mvn test                                             # against http://localhost:8000
mvn test -DbaseUrl=https://your-app.vercel.app       # against a deployed instance

mvn test
allure generate target/allure-results --clean -o target/allure-report && allure open target/allure-report
```

See [`java-tests/README.md`](java-tests/README.md) for the full breakdown.

### Java · Playwright E2E suite

The fourth stack (`java-e2e/`) is a Java browser-automation suite — JUnit 5 + Playwright-for-Java
driving the real UI in a real browser, the Java counterpart to `e2e/` and `tests/e2e/`. It covers
the same core flows (sign-in modal, projects, suites, test cases, a run) through a Java Page
Object Model, rather than the API layer `java-tests/` covers.

```
java-e2e/
├── pom.xml
└── src/test/java/com/testflow/e2e/
    ├── support/                 # Playwright lifecycle, bootstrap-admin auth, unique naming
    ├── pages/                   # Page Object Model — mirrors e2e/pages/*.ts
    ├── LoginTest.java           # sign-in modal: render, valid/invalid login
    ├── ProjectsTest.java        # create/delete a project through the UI
    ├── SuitesTest.java          # create a suite inside a project
    ├── TestCasesTest.java       # create a test case
    └── RunsTest.java            # start a run, mark results, summary counts
```

**Engineering practices this demonstrates:**

- **Same Page Object Model discipline as the other two browser stacks**, ported to Java:
  `pages/*.java` mirror `e2e/pages/*.ts` locator-for-locator (`data-testid` selectors, the same
  modal/form flows), so a bug caught by one stack's page object has an equivalent check here.
- **API-driven setup, UI-driven assertions.** Test data (projects, suites, test cases) is created
  through `ApiClient` (a plain JDK `HttpClient`, no extra dependency) rather than the UI, the same
  "drive setup through the API, assert through the UI" pattern `e2e/tests/*.spec.ts` uses via
  Playwright's `request` fixture — keeps each spec focused on the one flow it's testing.
- **Same shared bootstrap-admin convention** as `java-tests/` and `e2e/global-setup.ts` — see
  [`java-e2e/README.md`](java-e2e/README.md#auth-strategy).
- **Allure reporting**, via `allure-junit5`, in the same format the other three stacks produce.

```bash
# app must be running first (see Quick start above)
cd java-e2e
mvn test                                             # headless, against http://localhost:8000
mvn test -Dheaded=true                               # headed Chromium, for debugging
mvn test -DbaseUrl=https://your-app.vercel.app       # against a deployed instance

allure generate target/allure-results --clean -o target/allure-report && allure open target/allure-report
```

See [`java-e2e/README.md`](java-e2e/README.md) for the full breakdown.

### CI wiring (`.github/workflows/`)

| Workflow | Trigger | What runs |
|----------|---------|-----------|
| `test.yml` | every PR + push to `main` | `tests/unit` + `tests/api` + `tests/contract` + `tests/services` (blocking); `tests/e2e/test_e2e.py` on push to `main` only (non-blocking) |
| `pw-scheduled.yml` | weekly cron | `tests/e2e/test_e2e.py` + `tests/e2e/test_users_e2e.py` against the live deployment |
| `pw-regression.yml` | manual dispatch | full `-m regression` suite across all layers against a chosen target URL |
| `pw-ts.yml` | every PR + push to `main` touching `e2e/`, `api/`, `static/`; daily cron | full `e2e/tests/*.spec.ts` suite, HTML/JSON report uploaded as an artifact |
| `java-api-tests.yml` | every PR + push to `main` touching `java-tests/`, `api/`, `shared/` | starts the app locally, runs the full `java-tests/` JUnit suite, Allure report uploaded as an artifact |
| `java-e2e-tests.yml` | every PR + push to `main` touching `java-e2e/`, `api/`, `static/` | starts the app locally, installs Playwright's Chromium, runs the full `java-e2e/` JUnit suite, Allure report uploaded as an artifact |

---

## Project structure

```
.
├── api/                          # Monolith (FastAPI single-process)
│   ├── main.py                   # All routes, WebSocket, AI generation, middleware
│   ├── models.py                 # SQLAlchemy ORM models
│   ├── schemas.py                # Monolith-only Pydantic schemas + re-exports from shared/
│   └── database.py              # DB engine + session factory
│
├── shared/                       # Pydantic schemas shared by api/ and every services/*
│   └── schemas.py                #   see its docstring for what was unified and why
│
├── services/                     # Microservice architecture
│   ├── gateway/                  # :8000 HTTP proxy + WebSocket bridge + SPA files
│   ├── auth/                     # :8001 JWT login · register · user management
│   ├── projects/                 # :8002 Projects · suites · test cases · analytics
│   ├── runs/                     # :8003 Test runs · results · WebSocket · Redis events
│   ├── ai/                       # :8004 Claude Haiku AI test case generation
│   └── README.md                 # Microservice architecture deep-dive
│
├── static/
│   ├── index.html                # SPA shell (Chart.js CDN included)
│   └── app.js                    # All UI logic — hash routing, WebSocket, Chart.js
│
├── tests/                        # Python pytest suite, layered
│   ├── unit/                     # pure JWT/hash logic — no DB, no HTTP
│   ├── api/                      # FastAPI TestClient integration tests
│   ├── contract/                 # Schemathesis property tests vs. the OpenAPI schema
│   ├── services/                 # per-microservice TestClient tests (services/ coverage)
│   └── e2e/                      # Playwright browser + deployed-instance API tests
│       └── pages/                # page objects for the browser E2E specs
├── e2e/                          # Playwright TypeScript E2E tests (incl. contract.spec.ts)
├── java-tests/                   # JUnit 5 + REST Assured black-box API tests
├── java-e2e/                     # JUnit 5 + Playwright Java browser E2E tests
├── Dockerfile                    # Monolith container
├── docker-compose.yml            # Monolith mode (app + Postgres)
├── docker-compose.microservices.yml  # Microservice mode (5 services + Postgres + Redis)
├── requirements.txt
└── vercel.json                   # Vercel serverless deployment (monolith)
```

---

## Deployment

### Vercel (monolith)
The app deploys automatically to **Vercel** on every push to `main` via GitHub Actions.
Each pull request gets its own preview URL.
Set `DATABASE_URL` (Neon Postgres), `JWT_SECRET_KEY`, and `ANTHROPIC_API_KEY` in Vercel environment variables.

### Self-hosted (microservices)
Use `docker-compose.microservices.yml` with a Postgres 16 instance and Redis 7.
The gateway container is the only one that needs to be publicly exposed.
