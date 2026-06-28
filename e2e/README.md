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
│   └── api.spec.ts          # API-level tests (no browser)
├── global-setup.ts          # Registers e2e test user and saves auth token
├── playwright.config.ts
└── tsconfig.json
```

## CI

The `pw-ts.yml` GitHub Actions workflow runs on pushes to `main` affecting `e2e/`, `api/`, or `static/`, and on PRs. It starts the FastAPI app locally, runs all tests, and uploads the HTML report as an artifact.
