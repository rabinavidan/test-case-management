// Specs written before the layering rules (eslint.config.mjs) existed.
// They are exempt from the spec rules until migrated. This list may only
// SHRINK: a new spec is never added here, and a migrated spec is removed in
// the same PR that migrates it (projects/suites/testcases/runs/login were the
// first). The number is that file's violation count when the baseline was
// taken (885 in total across 38 files) — the migration backlog.
//
// api.spec.ts, contract.spec.ts and mock-contract-drift.spec.ts verify the
// HTTP contract itself, so when migrated they keep direct `request` access
// (a narrower override), but still lose hard-coded URLs to api/routes.ts.
export const LEGACY_SPECS = [
  'tests/accessibility-gate.spec.ts',            // 9
  'tests/accessibility-responsiveness.spec.ts',  // 38
  'tests/admin-pages.spec.ts',                   // 43
  'tests/api-timeout-resilience.spec.ts',        // 5
  'tests/api.spec.ts',                           // 26
  'tests/contract.spec.ts',                      // 24
  'tests/environments.spec.ts',                  // 21
  'tests/graphql.spec.ts',                       // 2
  'tests/guest-recruiter-fixes.spec.ts',         // 29
  'tests/hero-impact.spec.ts',                   // 10
  'tests/home-overview.spec.ts',                 // 55
  'tests/home-smoke.spec.ts',                    // 36
  'tests/kpi-quality-gate-dashboard.spec.ts',    // 23
  'tests/layout-budget.spec.ts',                 // 5
  'tests/live-demo-pipeline.spec.ts',            // 9
  'tests/mock-contract-drift.spec.ts',           // 1
  'tests/mocked-api-errors.spec.ts',             // 18
  'tests/mocked-serverless-ai-features.spec.ts', // 42
  'tests/mocked-serverless-ai-review.spec.ts',   // 28
  'tests/mocked-serverless-crud.spec.ts',        // 18
  'tests/mocked-serverless-errors.spec.ts',      // 28
  'tests/mocked-serverless-realtime.spec.ts',    // 15
  'tests/parent-lookup.spec.ts',                 // 28
  'tests/portfolio-positioning.spec.ts',         // 32
  'tests/projects-list.spec.ts',                 // 39
  'tests/realtime.spec.ts',                      // 3
  'tests/recruiter-tour-architecture.spec.ts',   // 43
  'tests/responsive.spec.ts',                    // 46
  'tests/run-quick-record.spec.ts',              // 26
  'tests/seed.spec.ts',                          // 1
  'tests/sidebar-progress-bar.spec.ts',          // 17
  'tests/success-stories.spec.ts',               // 30
  'tests/test-pyramid-ai-engineering.spec.ts',   // 26
  'tests/top-repos.spec.ts',                     // 24
  'tests/ui-regressions.spec.ts',                // 6
  'tests/user-journey.spec.ts',                  // 20
  'tests/ux-modern.spec.ts',                     // 31
  'tests/ux-quick-wins.spec.ts',                 // 28
];
