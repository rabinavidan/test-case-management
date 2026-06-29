---
name: ui-e2e-standards
description: "Apply this skill when writing new UI E2E tests, creating or modifying page objects, or reviewing test files in apps/salesOS/playwright/tests. Do NOT apply for pure API tests (*-be.spec.ts), unit tests, or non-browser code."
---

# UI E2E Standards Skill

Apply this skill when writing or reviewing UI E2E test files in the SalesOS Playwright suite.

**Scope:** Apply to `*.spec.ts` UI tests, page object files (`src/pages/*.ts`), and fixture files. Skip `*-be.spec.ts` API-only tests.

---

## 1. Imports

Always import `test` from the fixtures file, never directly from `@playwright/test`. Import `expect` from `@playwright/test`.

```typescript
// ✅ Correct
import { expect } from '@playwright/test';
import { test } from '../../../src/fixtures/fixtures';

// ❌ Wrong — bypasses page object fixtures
import { test, expect } from '@playwright/test';
```

---

## 2. Test Structure

Every test must be inside a `test.describe` block. Use `test.step()` to wrap every logical action.

```typescript
test.describe('@Feature Tests', () => {
  test(
    'CI-XXXX: <descriptive test title>',
    { tag: [...] },
    async ({ loginPage, homePage }) => {
      await test.step('Login to SalesOS', async () => {
        await loginPage?.appLoginUnified(TEST_USER, 'SOS');
      });

      await test.step('Verify <something> is visible', async () => {
        await expect(homePage.homePageContainer).toBeVisible({ timeout: 50000 });
      });
    }
  );
});
```

**Rules:**
- Test name must include a ticket/feature reference (e.g., `CI-3101:`)
- Every logical action must be wrapped in a named `test.step()`
- Steps use plain English describing behavior, not implementation
- Never perform direct assertions outside a `test.step()`

---

## 3. Fixtures

Inject page objects via fixtures — never instantiate them directly in tests.

```typescript
// ✅ Correct — injected via fixture
async ({ loginPage, homePage, advancedSearch }) => { ... }

// ❌ Wrong — direct instantiation inside test
async ({ page }) => {
  const homePage = new HomePage(page); // never do this in spec files
}
```

Available fixtures (from `src/fixtures/fixtures.ts`):
`loginPage`, `homePage`, `advancedSearch`, `intentPage`, `alertsPage`, `profilesPage`, `whitespacePage`, `adminPortalPage`, `utilities`, `salesOSPage`, `listPage`, `sideNavigation`, `fundingAlertsPage`, `notificationsPage`, `technologiesPage`, `intentRecommendationsHelper`

---

## 4. Page Object Model

All selectors and interactions live in page objects under `src/pages/`. Tests only call page object methods — no raw locators or `page.locator()` calls inside spec files.

**Page object structure:**
```typescript
export class MyFeaturePage {
  page: Page;
  utils: Utilities;

  // Declare all locators as class properties
  myButton: Locator;
  myInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.utils = new Utilities(page);
    this.myButton = page.locator('[data-automation-id="my-button"]');
    this.myInput = page.locator('[data-automation-id="my-input"]');
  }

  public async clickMyButton() {
    await this.myButton.waitFor({ state: 'visible', timeout: this.utils.THIRTY_SECONDS });
    await this.myButton.click();
  }
}
```

**Rules:**
- Locators are class properties, not local variables inside methods
- Methods use `waitFor` before interactions
- Methods are `public async` unless internal-only
- No raw selectors in spec files

---

## 5. Locator Strategy (priority order)

| Priority | Strategy | Example |
|----------|----------|---------|
| 1st | `data-automation-id` | `page.locator('[data-automation-id="btn-email"]')` |
| 2nd | `getByRole` (semantic) | `page.getByRole('tab', { name: 'Intent' })` |
| 3rd | CSS class | `page.locator('.email-generator-wrapper')` |
| 4th | XPath | `page.locator("//a[span[text()='Intent']]")` — avoid if possible |

Set in `playwright.config.ts`: `testIdAttribute: 'data-automation-id'` — so `page.getByTestId('btn-email')` also works.

---

## 6. Timeouts

Use constants from the `Utilities` class instead of magic numbers.

```typescript
// ✅ Correct
await element.waitFor({ state: 'visible', timeout: this.utils.THIRTY_SECONDS });
await expect(locator).toBeVisible({ timeout: this.utils.SIXTY_SECONDS });

// ❌ Wrong
await element.waitFor({ state: 'visible', timeout: 30000 }); // magic number
```

| Constant | Value |
|----------|-------|
| `utils.TEN_SECONDS` | 10,000 ms |
| `utils.THIRTY_SECONDS` | 30,000 ms |
| `utils.SIXTY_SECONDS` | 60,000 ms |

Use `test.setTimeout(ms)` for tests that require more than the global 25-minute default.

---

## 7. Assertions

```typescript
// Visibility
await expect(page.myElement).toBeVisible({ timeout: utils.THIRTY_SECONDS });

// Text content
await expect(page.myChip).toContainText('Expected Label');

// Soft assertions (non-blocking — use only when failure should not stop test)
await expect.soft(page.optionalBadge).not.toBeVisible();

// Always use custom messages for non-obvious assertions
expect(authToken, 'Auth token should be present after login').toBeTruthy();
```

**Rules:**
- Prefer `.toBeVisible()` over `.isVisible()` — the former retries automatically
- Add timeout overrides only when the default is insufficient for the element
- Use `expect.soft()` only for non-critical supplementary checks
- Provide a custom message when the assertion purpose is not self-evident

---

## 8. Authentication

Always login via `loginPage.appLoginUnified(username, product)` inside a `test.step`.

```typescript
await test.step('Login to SalesOS', async () => {
  await loginPage?.appLoginUnified(TEST_USER, 'SOS');
});
```

Use predefined test users (e.g., `'team16-ci36452'`). Never hardcode passwords — use environment variables or CMS.

---

## 9. Test Data & Setup/Teardown

- Colocate test data files with spec files (e.g., `saved-search-test-data.ts` next to `saved-search.spec.ts`)
- Generate unique values using timestamps to prevent collisions

```typescript
import { generateTimestamp } from '../../../src/helper/timeStamp';

const searchName = `MY_SEARCH_${generateTimestamp()}`;
```

- Use `test.beforeEach` for setup (API login, state initialization)
- Use `test.afterEach` for cleanup — always delete created test data via API

```typescript
test.afterEach(async () => {
  if (createdId) {
    await apiClient.deleteById(createdId, authToken);
  }
});
```

- Export test constants as `as const` for type safety

```typescript
export const SEARCH_TYPES = {
  PEOPLE: 'GROW_SAVED_SEARCH_PEOPLE',
  COMPANY: 'GROW_SAVED_SEARCH_COMPANY',
} as const;
```

---

## 10. Tags

Every test must include all four required tag groups (combined across `test.describe` and `test`).

| Tag group | Cardinality | Examples |
|-----------|-------------|---------|
| `@Team` | exactly one | `@Team-Team-16` |
| `@Product` | exactly one | `@Product-SalesOs`, `@Product-dozi` |
| `@TestingLayer` | exactly one | `@TestingLayer-systemTest` |
| `@Component` | one or more | `@Component-shell`, `@Component-alerts-dispatcher-ms` |

Allowed `@TestingLayer` values: `systemTest`, `integrationTest`, `componentTest`, `unitTest`, `performanceTest`

Additional tags like `@Regression`, `@Sanity`, `@Positive`, `@API-Only` are allowed but do not replace the four required groups.

Include an `annotation` with numbered steps:
```typescript
{
  annotation: [{
    type: 'Steps',
    description: `
      1. Login to SalesOS
      2. Navigate to the feature
      3. Verify the expected state
    `,
  }],
}
```

---

## 11. Logging

Use the project logger — never `console.log`.

```typescript
import { logger } from '../../../src/helper/logger';

logger.info('🔍 Searching for company: ${companyName}');
logger.success('✅ Search completed');
logger.warning('⚠️ Element not found, skipping');
logger.error('❌ Unexpected state', error);
```

| Level | Emoji | When to use |
|-------|-------|-------------|
| `info` | 🌐 / 🔍 | General progress |
| `success` | ✅ | Verified state reached |
| `warning` | ⚠️ | Recoverable skip/assumption |
| `error` | ❌ | Unexpected failure before throw |
| `action` | (none) | User action performed |
| `step` | (none) | Named test step entered |

Log inside page object methods, not in spec files. Spec files should only contain `test.step()` orchestration.

---

## 12. File Naming Conventions

| Artifact | Convention | Example |
|----------|------------|---------|
| Test spec | `<feature>-<description>.spec.ts` | `saved-search-based-on-text-input.spec.ts` |
| Page object | `<feature>-page.ts` | `advanced-search.ts`, `home-page.ts` |
| Test data | `<feature>-test-data.ts` | `saved-search-test-data.ts` |
| Helper | `<feature>Helper.ts` or `<feature>-helper.ts` | `advancedSearchHelper.ts` |
| API client | `<feature>-api-client.ts` | `saved-search-api-client.ts` |

All files use kebab-case. Test specs live in `playwright/tests/<Feature>/`. Page objects live in `src/pages/`.

---

## 13. Directory Structure

```
apps/salesOS/
├── playwright/
│   └── tests/
│       └── <Feature>/
│           ├── <feature>.spec.ts
│           └── <feature>-test-data.ts
└── src/
    ├── fixtures/
    │   └── fixtures.ts          ← extend here to add new page object fixtures
    ├── pages/
    │   └── <feature>-page.ts    ← page objects
    ├── helper/
    │   ├── logger.ts
    │   ├── utils.ts
    │   └── timeStamp.ts
    └── common-backend-library/  ← API clients, auth helpers
```

---

## 14. Playwright MCP – Assisted Test Authoring

When writing or debugging E2E tests with Claude Code, use the `playwright` MCP server (configured in `.claude/settings.json`) to inspect the live app before writing selectors or assertions.

**Workflow:**
1. Start the backend: `uvicorn api.main:app --reload` (from the repo root)
2. Ask Claude to navigate and snapshot: *"Navigate to http://localhost:8000 and give me a snapshot of the projects page"*
3. Use the snapshot to find the right `data-testid` or ARIA role for your locator
4. Ask Claude to screenshot after an action to verify state

**Rules:**
- Use MCP snapshots to discover locators — do not guess selectors
- Do not commit tests whose selectors were written without verifying the element exists in a snapshot or screenshot
- MCP tools are for authoring time only; they are not used during `npm test` runs

## Compliance Checklist

Before committing a UI E2E test, verify:

1. `test` is imported from `src/fixtures/fixtures`, not `@playwright/test`?
2. Every test is inside `test.describe`?
3. Test name contains a ticket/feature reference?
4. Every logical action is in a `test.step()`?
5. No raw `page.locator()` calls inside spec files — all selectors in page objects?
6. Locators prefer `data-automation-id` first?
7. Timeout constants from `Utilities` used (no magic numbers)?
8. All four required tag groups present (`@Team`, `@Product`, `@TestingLayer`, `@Component`)?
9. `@TestingLayer` value is one of the five allowed values?
10. `test.afterEach` cleans up all created test data?
11. No `console.log` — use `logger.*` instead?
12. Unique test data generated with `generateTimestamp()`?

**If ANY answer is NO — fix it before committing.**