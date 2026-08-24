## Summary

Surfaces and strengthens the existing Playwright + TypeScript automation so the
repo reads as a strong automation-engineering portfolio at a glance, and closes a
few specific gaps (smoke tier, Postman, AI-workflow docs). No production code
changed — this is test, tooling and docs only.

## What's added

- **Smoke suite** (`e2e/tests/smoke.spec.ts`, tag `@smoke`) — a fast critical-path
  check across project → suite → test cases → run, plus an authenticated app-shell
  load. Gates merges and post-deploy validation without the full regression.
- **npm scripts** — `test:smoke` (`--grep @smoke`) and `test:regression`
  (`--grep-invert @smoke`).
- **Postman collection** (`postman/TestFlow.postman_collection.json`) — auth,
  projects, suites, test cases, AI generate, runs and health, with login capturing
  the bearer token automatically.
- **AI workflow doc** (`e2e/AI.md`) — how the suite is authored and maintained with
  Playwright MCP and Claude, with the review guardrails.
- **README** — live CI badges and an "Automation & QA — Playwright + TypeScript"
  section at the top (POM, multi-browser, smoke vs regression, CI, MCP, Postman).

## Notes

- GitHub Pages is left untouched — it is already owned by the Jekyll workflow, so
  no second Pages deployment was introduced. CI badges provide the live link.
- The smoke run assumes `POST /api/suites/{id}/runs` accepts `{ name }`. If the API
  expects a different field, it is a one-line change.

## Test plan

- `cd e2e && npm install && npx playwright install`
- `npm run test:smoke` passes locally (chromium, firefox, webkit)
- `npx tsc --noEmit -p tsconfig.json` is clean
