# Interview Prep — QA Automation Lead (Nisha Pro, Tel Aviv, hybrid)

Personal notes mapping this repo (TestFlow) to the job posting, for interview prep — not project
documentation. Role: **AI-Driven QA Automation Lead**, posted by Nisha Pro (recruiting for a financial/fintech
organization), Tel Aviv District, hybrid (4 days office / 1 day home).

## Requirement-by-requirement mapping

| Job requirement | Repo evidence | File / link |
|---|---|---|
| 5+ years QA incl. Mobile | Frame this from your own CV — the repo doesn't demonstrate mobile testing directly (see **Honest gaps** below) | — |
| QA Lead / Tech Lead / Dev Team Lead experience | Repo is architected and driven as a lead would run it: five independent test stacks each targeting a hiring context, a written test strategy, CI gating policy, coverage floor | `README.md#test-architecture` |
| 2+ years Cucumber/Gherkin | New Cucumber.js + Playwright BDD suite, Gherkin feature files with a `Scenario Outline`/`Examples` table, hooks, custom World | [`e2e-bdd/`](../../e2e-bdd/README.md) |
| 2+ years Mobile Automation (Appium/Detox) | Not directly covered — TestFlow's UI is a web SPA, not a mobile app. Talking point: the same BDD/Playwright skill set (Page Object Model, Gherkin authoring, CI wiring) transfers directly to Appium/Detox once given a mobile target | `e2e-bdd/pages/*.page.ts` (POM discipline) |
| 2+ years React Native | Not covered — TestFlow's frontend is Vanilla JS, not React Native | — |
| JavaScript / TypeScript / Python / Java | All four, each with a real automation stack, not toy examples | pytest (`tests/`), Playwright TS (`e2e/`), REST Assured + Playwright Java (`java-tests/`, `java-e2e/`) |
| CI/CD | Six GitHub Actions workflows, each scoped to the stack/paths it covers, with coverage gating and artifact publishing | `.github/workflows/` |
| Azure DevOps | New Azure Pipelines YAML — multi-job pipeline, `PublishTestResults@2`/`PublishCodeCoverageResults@2`, pip/npm caching | [`azure-pipelines.yml`](../../azure-pipelines.yml) |
| Test Data, Mocks, Stubs, Service Virtualization | `anthropic.Anthropic` mocked at the true external boundary (not the app's own layers); throwaway per-test SQLite DBs; graceful-degradation tests with Redis/downstream services unreachable | `tests/api/test_ai_generate.py`, `tests/services/test_events_resilience.py` |
| AI Testing / AI-driven QA | Three CI-time AI agents (PR Steward, Coverage-Gap Agent, Flaky-Test Detector) plus an authoring-time Playwright agent trio (planner/generator/healer) — a genuinely agentic AI-in-QA story, not just "we called an LLM" | `README.md#ai-engineering--not-just-ai-features` |
| Automation First / Quality Engineering culture | Five parallel stacks, ~89% coverage gated at an 85% CI floor, contract testing (Schemathesis + ajv/fast-check) catching real bugs, documented in code not just claimed | `README.md#test-architecture`, `pytest.ini`, `.coveragerc` |
| Coaching / Mentoring | Not directly demonstrable from a solo repo — bring concrete examples from your own experience here | — |
| Fintech/Banking (advantage) | Not applicable to this repo directly — bring your own domain experience | — |

## Honest gaps — don't oversell these

- **No live mobile app or Appium/Detox harness in this repo.** Be upfront in the interview: the BDD suite here
  proves Gherkin/Cucumber fluency and Page Object Model discipline, which is the transferable half of mobile
  automation — the mobile-specific half (device farms, native selectors, Appium's WebDriver protocol, Detox's
  gray-box React Native hooks) would need real project experience to speak to credibly. Don't claim hands-on
  Appium/Detox based on this repo.
- **No React Native.** Same honesty applies — the frontend here is Vanilla JS.
- **`azure-pipelines.yml` isn't wired to a live Azure DevOps project.** It's real, runnable YAML (same jobs,
  same test suites as the GitHub Actions workflows) included specifically to demonstrate Azure Pipelines
  authoring for this job's requirement, and the repo's own comment at the top of the file says so plainly. If
  asked "have you actually run this in Azure DevOps," say exactly that.

## Talking points for the interview

1. **"I built five independent, feature-equivalent test stacks on purpose, not by accident."** Walk through why:
   each targets a different hiring/interview context (Python, TypeScript, Java x2, Cucumber/Gherkin), and they
   stay independent — no shared `node_modules`/workspace — because that's what let a real TypeScript
   duplicate-`Playwright`-types conflict get sidestepped cleanly instead of forcing a monorepo restructure.
   Mention this concretely if asked about tricky automation problems you've solved (`e2e-bdd/README.md`
   documents the exact conflict and the reasoning).

2. **"AI in QA, done as engineering, not magic."** The Coverage-Gap Agent diffs a PR's changed source against
   its tests and asks an LLM for concrete missing test cases; the PR Steward reads CI logs and pushes real
   fixes; the Flaky-Test Detector is deliberately *not* AI (pattern-matching is enough and cheaper). That
   distinction — knowing when AI is the right tool vs. overkill — is exactly what "AI-Driven QA" should mean,
   and it's a strong differentiator against candidates who just add an LLM call everywhere.

3. **"Contract tests, not just example-based ones, caught real bugs."** Schemathesis (Python) and
   ajv+fast-check (TypeScript) property-test the app's own live OpenAPI schema and found actual regressions —
   a UTC-offset serialization bug and an integer-overflow crash — cite these as concrete "shift-left" wins,
   not hypothetical value.

4. **"CI runs the right layer at the right cadence."** Fast layers (unit/API/contract/services) gate every PR;
   full browser E2E and cross-stack regression run on a schedule/manual dispatch — this maps directly onto the
   posting's "Automation First" and "Quality Engineering" language, and gives you a concrete answer if asked
   how you'd structure a pipeline from scratch.

## Questions worth asking them

- What does the current mobile automation setup look like today (Appium vs. Detox, device farm or emulators
  only, how flaky is it)?
- Is "Automation First" an existing initiative you're continuing, or a transformation you're expected to lead
  from a lower-maturity starting point?
- What's the current CI/CD split between Azure DevOps and any other tooling, and how much ownership would this
  role have over the pipeline design itself vs. just the test suites running in it?
