---
name: api-logging-standards
description: "Apply this skill when writing new API tests, creating or modifying API client classes (*-endpoint.ts, *-helper.ts), implementing API endpoint methods, or refactoring existing API tests. Do NOT apply for UI/E2E browser tests, unit tests, or non-API code."
---

# API Logging Standards Skill

Apply this skill to enforce consistent, comprehensive logging across all API test layers in the Playwright monorepo.

**Scope:** Apply to files matching `*-endpoint.ts`, `*-helper.ts`, and `*-be.spec.ts`. Skip UI tests, unit tests, and non-API code.

---

## Logging Hierarchy

```
1. BaseApiClient          → Logs ALL HTTP requests/responses (already implemented, do not modify)
2. *-endpoint.ts          → Logs business operations (create, update, delete, get)
3. *-helper.ts            → Logs complex operations (polling, transformations, validations)
4. *-be.spec.ts           → NO logging — pure orchestration only
```

---

## Layer 2: Endpoint Classes (`*-endpoint.ts`)

**Rules:**
- Add `@step` decorator only to public methods called directly from spec files
- Do NOT add `@step` to internal/private methods (prevents nested steps in Allure)
- Log before calling the base API method and after success
- Include entity ID in success log

**Template:**
```typescript
import { step } from '@shared';

@step('[Operation description]')
async operationAndVerify(id: string, authToken: string, data?: any): Promise<ReturnType> {
  Logger.logging.info(`[EMOJI] [Operation description]: ${id}`);

  const response = await this.baseMethod(id, authToken, data);

  expect(response.status, `[Method] /api/path: expected [code]. Got: ${response.status}`).toBe([code]);
  expect(response.body.field, `Expected field. Got: ${JSON.stringify(response.body)}`).toBeDefined();

  Logger.logging.info(`✅ [Operation] completed successfully for ${id}`);

  return response.body;
}
```

**CRUD patterns:**

| Operation | Log emoji | Example log message |
|-----------|-----------|---------------------|
| CREATE    | 📝        | `📝 Creating new [entity]: "${payload.name}"` |
| READ/GET  | 📋        | `📋 Getting [entity] with ID: ${id}` |
| UPDATE    | ✏️        | `✏️ Updating [entity] ${id} with: ${JSON.stringify(updates)}` |
| DELETE    | 🗑️        | `🗑️ Deleting [entity]: ${id}` |
| LIST      | 📋/📊     | `📋 Getting list of [entities]${filterDesc}` then `📊 Retrieved ${items.length} [entities]` |
| SUCCESS   | ✅        | `✅ [Entity] created successfully with ID: ${id}` |
| ERROR     | ❌        | `❌ Operation failed: ${error.message}` |

---

## Layer 3: Helper Classes (`*-helper.ts`)

**Rules:**
- Same `@step` rules as endpoint classes (public methods called from specs only)
- Log input and output data for transformation methods
- Log progress during polling/waiting loops

**Template:**
```typescript
import { step } from '@shared';
import { Logger } from '@shared/utils/logger';

@step('[Operation description]')
static async helperOperation(params: unknown): Promise<unknown> {
  Logger.logging.info(`[EMOJI] [Operation description] with: ${JSON.stringify(params)}`);

  // Operation logic

  Logger.logging.info(`✅ [Operation] completed: ${String(params)}`);
  return params;
}
```

**Helper-specific emojis:**

| Operation          | Emoji |
|--------------------|-------|
| WAITING/POLLING    | ⏳    |
| SEARCH/EXTRACTION  | 🔍    |
| TRANSFORMATION     | 🔄    |
| VALIDATION         | ✔️    |
| STATISTICS         | 📈    |

**Polling pattern:**
```typescript
@step('Wait for [entity] to reach expected status')
static async waitForStatus(endpoint, id, authToken, expectedStatus, maxAttempts = 60): Promise<void> {
  Logger.logging.info(`⏳ Waiting for [entity] ${id} to reach status: ${expectedStatus} (max ${maxAttempts} attempts)`);

  let attempts = 0;
  let currentStatus = '';

  while (attempts < maxAttempts) {
    const entity = await endpoint.getById(id, authToken);
    currentStatus = entity.status;

    if (currentStatus === expectedStatus) {
      Logger.logging.info(`✅ [Entity] ${id} reached status: ${expectedStatus} after ${attempts + 1} attempts`);
      return;
    }

    attempts++;
    Logger.logging.info(`   Attempt ${attempts}/${maxAttempts}: Current status is ${currentStatus}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  throw new Error(`[Entity] ${id} did not reach status ${expectedStatus} after ${maxAttempts} attempts. Last status: ${currentStatus}`);
}
```

---

## Layer 4: Test Spec Files (`*-be.spec.ts`)

**Rules:**
- **NO `Logger.logging.*` calls in spec files** — all logging belongs in endpoint/helper methods
- **NO `expect()` calls in spec files** — all assertions belong in endpoint/helper methods
- **NO `test.step()`** — use `@step` decorator on endpoint/helper methods instead
- Spec files are pure orchestration: call endpoint methods, track created IDs for cleanup
- Comments on every line explain the step number and purpose

**Pattern:**
```typescript
test(
  'Create entity, verify in list, delete and verify removal',
  {
    tag: ['@Team-<your-team>', '@Product-<your-product>', '@TestingLayer-systemTest', '@Component-feature', '@API-Only', '@Positive'],
    annotation: [
      {
        type: 'Steps',
        description: `
          1. Create a new entity and get its ID
          2. Verify entity appears in the list
          3. Delete the entity
          4. Verify entity is removed from the list
        `,
      },
    ],
  },
  async () => {
    const timestamp = generateTimestampWithSeconds();
    const entityName = `Test Entity_${timestamp}`;
    const payload = { name: entityName };

    // Step 1: Create entity and get its ID (validation happens in endpoint)
    const entityId = await endpoint.createAndGetId(authToken, payload);
    // Track ID for cleanup
    createdIds.push(entityId);

    // Step 2: Verify entity exists in list (validation happens in endpoint)
    await endpoint.verifyEntityInList(authToken, entityId);

    // Step 3: Delete entity (validation happens in endpoint)
    await endpoint.deleteAndVerify(entityId, authToken);

    // Step 4: Verify entity removed from list (validation happens in endpoint)
    await endpoint.verifyEntityNotInList(authToken, entityId);
  }
);
```

---

## Common Mistakes

| Wrong | Correct |
|-------|---------|
| `console.log(...)` | `Logger.logging.info(...)` |
| Logging without context: `'Creating entity'` | Include name/ID: `'📝 Creating entity: "foo"'` |
| Logging in spec what endpoint already logs | Let endpoint log; spec only orchestrates |
| `@step` on a private/internal method | `@step` only on public methods called from spec |
| Swallowing errors silently | `Logger.logging.error(\`❌ Failed: ${error.message}\`)` then re-throw |

---

## Compliance Checklist

Before committing, verify:
1. All endpoint methods have before/after logging with emoji prefixes?
2. All helper methods have before/after logging with emoji prefixes?
3. Entity IDs are logged when created?
4. No `console.log` statements?
5. No logging in spec files (unless logging a test-level result not already covered)?
6. `@step` decorator only on public methods called from specs?
7. No nested `@step` calls (method with `@step` does not call another method with `@step`)?
8. Consistent emoji prefixes per operation type?

**If ANY answer is NO — fix it before committing.**
