# TestFlow — Test Case Management

A lightweight test case management app: organize projects into test suites, write test cases, run them,
and track pass/fail history over time.

**Live demo:** https://test-case-management-rabinavidans-projects.vercel.app/

<!-- TODO: add a screenshot or short GIF of the app here, e.g.
![TestFlow screenshot](docs/screenshot.png)
-->

## Features

- Projects → Test Suites → Test Cases hierarchy, each with stats (suite/case/run counts, last-run pass rate)
- Test runs snapshot all active test cases and track pass / fail / skip / pending per case
- JWT-based auth with two roles: **admin** (full CRUD) and **executor** (run tests, record results)
- One-click demo data seeding for showing off the app with realistic sample projects

## Tech stack

| Layer      | Choice |
|------------|--------|
| Backend    | [FastAPI](https://fastapi.tiangolo.com/) + [SQLAlchemy](https://www.sqlalchemy.org/) + [Pydantic](https://docs.pydantic.dev/) |
| Auth       | Hand-rolled JWT (HS256/HMAC) + `passlib` password hashing |
| Frontend   | Vanilla JS single-page app, no build step, [Tailwind CSS](https://tailwindcss.com/) via CDN |
| Database   | SQLite locally, [Neon](https://neon.tech/) Postgres in production |
| Deployment | [Vercel](https://vercel.com/) (single serverless function serving both the API and the static frontend) |
| Testing    | `pytest` (API tests via FastAPI `TestClient`) + Playwright (E2E, Page Object Model) |
| CI         | GitHub Actions — API tests on every PR, E2E on push to `main`, scheduled weekly regression run |

## Getting started

### Prerequisites

- Python 3.11+

### Install

```bash
git clone <this-repo>
cd test-case-management
pip install -r requirements.txt
```

### Run locally

```bash
uvicorn api.main:app --reload
```

Open http://localhost:8000 — the app uses a local SQLite file (`testcases.db`) by default. To point it at
Postgres instead, set `DATABASE_URL` (or `POSTGRES_URL`) before starting the server.

The first user to register becomes the admin. To pre-seed an admin account instead, set
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_EMAIL` before starting the server.

## Running tests

```bash
pip install -r requirements-test.txt
```

**API tests** (fast, no network — spins up a local `TestClient` and SQLite DB):

```bash
python -m pytest tests/ --ignore=tests/test_e2e.py -v
```

**End-to-end tests** (Playwright, drive a real browser against a running deployment):

```bash
playwright install --with-deps chromium
python -m pytest tests/test_e2e.py --base-url=https://your-app.vercel.app -v
```

## Project structure

```
api/                  FastAPI backend
  main.py             routes, table creation, migrations, demo-data seeding
  models.py           SQLAlchemy models (Project → TestSuite → TestCase, TestRun → TestResult)
  schemas.py          Pydantic request/response schemas
  auth.py             JWT + password hashing, auth dependencies
static/               Vanilla JS frontend (index.html + app.js), served by the FastAPI app
tests/                pytest suite
  test_*.py           API tests (TestClient) and E2E tests (Playwright)
  pages/              Page Object Model classes for the E2E tests
  logger.py           structured step logger used by the E2E tests
scripts/              one-off data seeding scripts
```

## Deployment

Deployed to Vercel as a single serverless function (see `vercel.json`); all routes are handled by
`api/main.py`, which also serves the built-in static frontend. `VERSION` is bumped automatically on every
merge to `main` via a GitHub Actions workflow.
