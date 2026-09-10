# TestFlow – Cucumber/Gherkin BDD Suite

A behavior-driven test layer for the TestFlow app, written with [Cucumber.js](https://github.com/cucumber/cucumber-js)
and Playwright. It is the fifth automation stack in this repo (see the root
[README's Test Architecture](../README.md#test-architecture)) and exists specifically to demonstrate
Gherkin-based BDD authoring — feature files a non-engineer stakeholder can read, backed by a real Playwright
driver underneath — on top of the same app the other four stacks already cover.

## Why a separate stack instead of reusing `e2e/pages`

Every automation stack in this repo owns its Page Objects independently (Python pytest has its own under
`tests/e2e/pages`, Java REST Assured and Java Playwright have their own Java classes) rather than sharing code
across languages or tooling. This suite follows the same convention — `pages/login.page.ts` and
`pages/projects.page.ts` here are a small, purpose-built copy, not an import of `../e2e/pages`.

That's not just consistency for its own sake: importing `../e2e/pages` directly was tried first, and it fails to
type-check. `e2e/` and `e2e-bdd/` are independent npm packages with independent `node_modules`, each pulling in
its own copy of `@playwright/test` (and its nested `playwright-core`). TypeScript treats the `Page`/`ElementHandle`
types from those two copies as structurally incompatible, so a `Page` created in this package's own
`chromium.launch()` can't be passed into a Page Object class typed against the other package's copy — a classic
multi-install-of-the-same-library problem in JS/TS repos without a shared workspace. Fixing it "properly" would
mean converting `e2e/` and `e2e-bdd/` into an npm workspace with one deduplicated install, which would also mean
giving up their independent `package-lock.json` files and the ability to run each suite as a fully standalone
project — a worse trade for two suites this small. Keeping each stack self-contained sidesteps the problem
entirely and matches how the Java suites already do it.

## Setup

```bash
cd e2e-bdd
npm install
npx playwright install chromium   # first time only
```

## Running locally

The app must be running on `http://localhost:8000` first:

```bash
# In the repo root:
uvicorn api.main:app --reload

# Then in e2e-bdd/:
npm test                 # all scenarios
npm run test:smoke       # only @smoke-tagged scenarios
npm run test:regression  # only @regression-tagged scenarios
npx cucumber-js --tags "@auth and not @regression"   # ad hoc tag expressions
```

Against a different environment: `BASE_URL=https://your-env npm test`.

## Structure

```
e2e-bdd/
├── features/
│   ├── login.feature              # Sign-in modal: render, success, invalid credentials (Scenario Outline)
│   └── project_management.feature # Create / delete a project
├── pages/
│   ├── base.page.ts
│   ├── login.page.ts
│   └── projects.page.ts
├── step-definitions/
│   ├── world.ts        # Custom Cucumber World — one Page/BrowserContext per scenario
│   ├── hooks.ts         # Before/After (browser + auth context lifecycle)
│   ├── login.steps.ts
│   └── project.steps.ts
├── scripts/
│   └── cucumber-json-to-junit.js   # Converts the JSON report to JUnit XML for CI test-result publishers
├── cucumber.js          # Cucumber.js configuration (ts-node, formatters)
└── tsconfig.json
```

## Reporting

`npm test` writes `reports/cucumber-report.json` (Cucumber's native JSON format) alongside the console
progress-bar/summary output. `@cucumber/cucumber` dropped its built-in JUnit formatter years ago and the
community replacements are unmaintained, so `scripts/cucumber-json-to-junit.js` is a small, dependency-free
converter instead:

```bash
npm run report:junit   # reports/cucumber-report.json -> reports/cucumber-junit.xml
```

That JUnit file is what lets a CI tool that only understands JUnit — notably Azure Pipelines'
`PublishTestResults@2` task, see [`../azure-pipelines.yml`](../azure-pipelines.yml) — render these BDD results
the same way it renders everything else, without needing Allure or a Cucumber-specific viewer installed.

## CI

[`.github/workflows/bdd-cucumber.yml`](../.github/workflows/bdd-cucumber.yml) starts the FastAPI app, runs the
full suite, converts the report to JUnit, and uploads both reports as build artifacts — the same pattern
`pw-ts.yml` uses for the Playwright TS suite. [`../azure-pipelines.yml`](../azure-pipelines.yml) runs the same
suite through Azure Pipelines' native `PublishTestResults@2` task.
