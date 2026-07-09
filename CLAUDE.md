# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TestFlow — a test case management web app. FastAPI backend (`api/`) serves both the JSON API and a
single-page vanilla-JS frontend (`static/`), deployed as a single Vercel serverless function
(see `vercel.json`, which routes everything to `api/main.py`).

## Commands

Setup:
```bash
pip install -r requirements.txt
pip install -r requirements-test.txt   # adds pytest, httpx, playwright
playwright install --with-deps chromium   # only needed for E2E tests
```

Run the app locally:
```bash
uvicorn api.main:app --reload
```
Uses a local SQLite file (`testcases.db`) unless `DATABASE_URL`/`POSTGRES_URL` is set. On Vercel, SQLite
falls back to `/tmp` since the filesystem is otherwise read-only.

Run API tests (fast, no network — uses `test.db` + FastAPI `TestClient`):
```bash
python -m pytest tests/ --ignore=tests/test_e2e.py -v
```

Run a single test:
```bash
python -m pytest tests/test_projects.py::test_create_project -v
```

Run Playwright E2E tests (hit a real deployed URL, default is the production Vercel URL in `pytest.ini`):
```bash
python -m pytest tests/test_e2e.py --base-url=https://your-app.vercel.app -v
python -m pytest tests/ -m regression --base-url=<url> -v   # regression-tagged subset only
```
E2E tests log in via `E2E_USERNAME` / `E2E_EMAIL` / `E2E_PASSWORD` env vars (defaults exist in
`tests/pages/base_page.py`).

## Architecture

### Backend (`api/`)

Everything lives in four files — there's no routers/services split:
- `main.py` — all FastAPI routes, table creation, ad-hoc migrations, demo-data seeding, and (at the
  bottom) mounting `static/` and serving `index.html` for any unmatched path (SPA fallback).
- `models.py` — SQLAlchemy models: `User` → `Project` → `TestSuite` → `TestCase`, and separately
  `TestRun` → `TestResult` (one `TestResult` per test case per run). Cascade deletes flow down this tree
  (deleting a project deletes its suites/cases/runs).
- `schemas.py` — Pydantic request/response models.
- `auth.py` — hand-rolled JWT (HS256, HMAC-signed, base64url, no PyJWT/cryptography dependency) plus
  `passlib` password hashing. `get_current_user` / `require_admin` are FastAPI dependencies used to gate
  routes.

Key backend conventions:
- **No Alembic** — schema changes for existing deployments are handled by `_run_migrations()` in
  `main.py` running best-effort `ALTER TABLE` statements at cold start (wrapped in try/except per
  statement, since SQLite/Postgres will error if the column already exists).
- **Auth model**: registration (`POST /api/auth/register`) only works when zero users exist — it creates
  the first admin. All further users are created by an admin via `POST /api/users` and are `executor`
  role by default. Two roles: `admin` (full CRUD) and `executor` (can create runs / record results but
  not manage projects/suites/cases/users — enforced per-route via `require_admin` vs `get_current_user`).
- An optional admin can also be seeded/updated from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` /
  `SEED_ADMIN_EMAIL` env vars on every cold start (`_seed_admin()`); `/api/debug/seed` exposes this for
  troubleshooting serverless cold-start seeding issues.
- Test run lifecycle: creating a run snapshots all currently-`active` test cases into pending
  `TestResult` rows; a run is marked `completed_at` automatically once every result is non-pending.
- `/api/demo/*` endpoints seed hardcoded demo projects (large inline suite/case fixtures in `main.py`)
  for populating a fresh environment with realistic-looking data.

### Frontend (`static/`)

Single-page app with **no build step and no framework**: `index.html` + one `app.js` (~2600 lines),
styled with Tailwind loaded from CDN. Routing is hash-based (`#projects`, `#project/1`, etc.) driven by
a `state` object and a `router()` function. API calls go through a small `api()`/`GET`/`POST`/`PUT`/`DEL`
wrapper that attaches the JWT bearer token from `localStorage` and redirects to the auth modal on 401.
Modals (`showModal(type, data)`) and toasts are built by string-templating HTML into fixed container
elements rather than a component system.

**Every interactive element in the UI carries a `data-testid`** — this is the primary locator strategy
for Playwright tests, so when adding UI elements, add a matching `data-testid` rather than relying on
text/CSS selectors.

### Tests (`tests/`)

Two distinct kinds of tests, both under `pytest`:
- **API tests** (`test_projects.py`, `test_suites.py`, `test_testcases.py`, `test_runs.py`, `test_auth.py`)
  use FastAPI's `TestClient` against a dedicated SQLite `test.db`, reset per-test via the autouse
  `setup_db` fixture in `conftest.py`. Use the `auth_client` fixture for an authenticated admin client and
  `executor_client` for a non-admin client.
- **E2E tests** (`test_e2e.py`, `test_login_e2e.py`, `test_users_e2e.py`) drive a real browser against a
  running deployment via Playwright, using a Page Object Model under `tests/pages/` (`BasePage` +
  `ProjectsPage`, `ProjectPage`, `SuitePage`, `NewProjectModal`, `UsersPage`, `LoginPage`). Page objects
  expose actions/locators; test files only orchestrate and assert. All E2E tests are tagged
  `pytestmark = pytest.mark.regression`.
- `tests/logger.py` provides `PWLogger`, a structured step logger (`.step()`, `.action()`, `.assert_()`,
  `.navigate()`) used throughout page objects — prefer it over ad-hoc `print`/`logging` calls in test
  code so output stays consistent in the `pw.*` log stream that CI surfaces on failure.

### CI (`.github/workflows/`)

- `test.yml` — runs API tests on every push/PR to `main`; runs the Playwright E2E suite only on push to
  `main` (after Vercel has deployed), and E2E failures are non-blocking (`continue-on-error: true`).
  Both jobs write a Markdown test report to the GitHub Actions job summary.
- `pw-regression.yml` — manually-dispatched full `@regression` run against a chosen `base_url`.
- `pw-scheduled.yml` — cron'd Sunday run of the full E2E + users E2E suite against production.
- `bump-version.yml` — auto-bumps the patch version in `VERSION` on every push to `main` (excluding
  pushes that only touch `VERSION`, to avoid an infinite loop). `VERSION` is read by `api/main.py` and
  exposed via `GET /api/version`.

## Notes

- `.claude/skills/api-logging-standards.md` and `.claude/skills/ui-e2e-standards.md` describe conventions
  for a different, TypeScript-based Playwright monorepo (SalesOS) and do not apply to this repository —
  there are no `.ts` files here. Follow the Python/pytest conventions above instead.
