import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { FIXTURE_SCHEMA_REGISTRY } from '../mocks/schema-registry';

/**
 * "Mock healing" — the detection half (see e2e/README.md's "Serverless
 * mocked E2E tests" section). The mocked-serverless-*.spec.ts specs
 * hardcode response payloads via e2e/mocks/factories.ts instead of hitting
 * a real backend, which makes them fast and deterministic but means they'd
 * keep passing forever even if the real backend's response shape changed
 * out from under them - a mocked test can't fail on drift it never
 * observes. This spec is the safety net: unlike every mocked-serverless-*
 * spec, it DOES require a real backend, because it fetches the live
 * OpenAPI schema and validates every registered factory sample against its
 * declared schema with ajv - the exact same "TypeScript-side counterpart to
 * Schemathesis" approach e2e/tests/contract.spec.ts already uses for real
 * API responses, applied here to the mocks instead.
 *
 * A failure here means: the backend's response shape changed, and
 * e2e/mocks/factories.ts needs updating to match it (a human, or an agent
 * asked to do it - there is deliberately no automated fixer, see
 * docs/agent-governance.md's reasoning on where an orchestrator/auto-fixer
 * would and wouldn't add value). The failure message names exactly which
 * fixture and which ajv validation errors, so that update is a small,
 * targeted diff, not a re-investigation from scratch.
 */

type OpenApiDoc = { components: { schemas: Record<string, unknown> } };

test.describe('Mock contract drift: e2e/mocks/factories.ts matches the real OpenAPI schema', () => {
  let doc: OpenApiDoc;
  let ajv: Ajv2020;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/openapi.json');
    expect(res.ok()).toBeTruthy();
    doc = await res.json();

    ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ components: doc.components }, 'openapi');
  });

  for (const { schemaName, sample } of FIXTURE_SCHEMA_REGISTRY) {
    test(`${schemaName} mock sample matches the live schema`, async () => {
      expect(
        doc.components.schemas[schemaName],
        `no ${schemaName} in the live OpenAPI schema — was it renamed or removed? Update e2e/mocks/factories.ts and e2e/mocks/schema-registry.ts to match.`,
      ).not.toBeUndefined();

      const validate = ajv.compile({ $ref: `openapi#/components/schemas/${schemaName}` });
      const valid = validate(sample);
      expect(
        valid,
        `e2e/mocks/factories.ts's ${schemaName} sample no longer matches the real schema:\n${JSON.stringify(validate.errors, null, 2)}`,
      ).toBeTruthy();
    });
  }
});
