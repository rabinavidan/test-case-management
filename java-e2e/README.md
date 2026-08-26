# TestFlow — Java E2E Tests

Browser end-to-end suite for the TestFlow app, written with **JUnit 5 + Playwright-for-Java**.
This is a third browser-automation stack alongside [`../e2e`](../e2e) (Playwright TypeScript) and
[`../tests/e2e`](../tests/e2e) (Playwright pytest) — see the [root README](../README.md#test-architecture)
for how all three map to each other. It covers the same core user flows (auth, projects, suites,
test cases, a run) through a Java Page Object Model, driving the real UI in a real browser rather
than the API layer covered by [`../java-tests`](../java-tests).

## Structure

```
java-e2e/
├── pom.xml
└── src/test/java/com/testflow/e2e/
    ├── support/
    │   ├── BaseTest.java   # Playwright/Browser/Page lifecycle (JUnit 5)
    │   ├── ApiClient.java  # JDK HttpClient — seeds/cleans up test data through the API
    │   └── TestData.java   # unique naming so repeated runs never collide
    ├── pages/               # Page Object Model, mirrors e2e/pages/*.ts
    │   ├── BasePage.java
    │   ├── LoginPage.java
    │   ├── ProjectsPage.java
    │   ├── ProjectPage.java
    │   ├── SuitePage.java
    │   └── RunPage.java
    ├── LoginTest.java       # sign-in modal: render, valid/invalid login
    ├── ProjectsTest.java    # create/delete a project through the UI
    ├── SuitesTest.java      # create a suite inside a project
    ├── TestCasesTest.java   # create a test case
    └── RunsTest.java        # start a run, mark results, summary counts
```

## Running locally

The app must be running first:

```bash
# In the repo root:
pip install -r requirements.txt
uvicorn api.main:app --reload
# open http://localhost:8000
```

Then, in `java-e2e/`:

```bash
mvn test                               # headless, against http://localhost:8000
mvn test -Dheaded=true                 # headed Chromium, for debugging
mvn test -DbaseUrl=https://your-app.vercel.app   # against a deployed instance
```

The app loads Tailwind CSS and Chart.js from a CDN at runtime, so the browser needs outbound
internet access for CSS-driven behavior (e.g. modal show/hide) to render correctly — a fully
offline/locked-down network will make CDN-dependent assertions fail even though the underlying
flow works. This isn't an issue in normal CI/dev environments with regular internet access.

## Auth strategy

Same bootstrap-admin convention as [`e2e/global-setup.ts`](../e2e/global-setup.ts) and
[`java-tests/`](../java-tests/README.md#auth-strategy): `POST /api/auth/register` only succeeds
for the very first user on a given database, so this suite shares that account's fixed
username/password rather than trying to register its own. `BaseTest.signInAs(token)` injects the
token into `localStorage` before the app's first load — the same shortcut
`fixtures/auth.fixture.ts` uses — so most specs skip driving the login UI directly;
`LoginTest` is the one spec that exercises the actual sign-in modal end-to-end.

## Reporting

`allure-junit5` writes results to `target/allure-results`, matching the Allure setup already used
by the other three stacks:

```bash
mvn test
allure generate target/allure-results --clean -o target/allure-report && allure open target/allure-report
```
