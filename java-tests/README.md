# TestFlow — Java API Tests

Black-box API test suite for the TestFlow app, written with **JUnit 5 + REST Assured**. This is a
third, independent automation stack alongside the Python/pytest suite ([`../tests`](../tests)) and
the TypeScript/Playwright suite ([`../e2e`](../e2e)) — see the [root README](../README.md#test-architecture)
for how all three map to each other.

Unlike `tests/api` (which drives the FastAPI app in-process via `TestClient` against a throwaway
per-test SQLite DB), this suite is a real HTTP client hitting a **running instance** of the app —
the same style of black-box testing a Java QA engineer would write against any deployed service,
monolith or microservices, since the public `/api/*` surface is identical in both modes.

## Structure

```
java-tests/
├── pom.xml
└── src/test/java/com/testflow/api/
    ├── support/
    │   ├── BaseApiTest.java    # REST Assured base URI + Allure filter setup
    │   ├── AuthSupport.java    # bootstrap admin token, on-demand executor users
    │   └── TestData.java       # unique naming so repeated runs never collide
    ├── AuthApiTest.java        # login/me/token validation
    ├── ProjectsApiTest.java    # CRUD, pagination envelope, admin-only writes
    ├── SuitesApiTest.java      # CRUD, 404s, admin-only writes
    ├── TestCasesApiTest.java   # CRUD, defaults, the null-vs-omitted-field regression
    ├── RunsApiTest.java        # run creation, pending-result seeding, auto-completion
    └── UsersApiTest.java       # admin user management, self-delete guard
```

## Running locally

The app must be running first:

```bash
# In the repo root:
pip install -r requirements.txt
uvicorn api.main:app --reload
# open http://localhost:8000
```

Then, in `java-tests/`:

```bash
mvn test                              # against http://localhost:8000
mvn test -DbaseUrl=https://your-app.vercel.app   # against a deployed instance
# or: BASE_URL=https://your-app.vercel.app mvn test
```

## Auth strategy

`POST /api/auth/register` only ever succeeds for the very first user on a given database — every
user after that is created via `POST /api/users` by an existing admin, and is always assigned the
"executor" role. So there is exactly one admin account per server. `AuthSupport` shares the same
bootstrap username/password as [`e2e/global-setup.ts`](../e2e/global-setup.ts) ("register, ignore
the failure if it already exists, then log in") so this suite, the TypeScript suite, and a human
using the app can all run against the same live instance without fighting over who becomes the
first user. Tests that need to exercise non-admin behavior create a fresh, uniquely-named executor
user on demand via `AuthSupport.newExecutor()`.

## Reporting

`allure-junit5` + `allure-rest-assured` write results to `target/allure-results`, matching the
Allure setup already used by the Python (`allure-pytest`) and TypeScript (`allure-playwright`)
stacks:

```bash
mvn test
allure generate target/allure-results --clean -o target/allure-report && allure open target/allure-report
```
