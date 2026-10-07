---
name: failure-triage
description: Decide whether a failing CI test is a product bug, a test-code (automation) bug, or an infra/environment problem, and route it to the right owner. Use on any red pytest or Playwright CI run before changing code, and before re-running a job.
---

# Failure triage: product bug vs test-code bug vs infra

A red test answers one question first: **whose bug is it?** The fix, the
owner and whether a rerun is allowed all follow from that. Getting it
wrong is expensive in both directions: "fixing" a test to hide a product
bug ships the bug, and patching product code for a broken locator adds a
regression.

## 1. Get the deterministic verdict

`scripts/failure_classifier.py` labels every failure in the reports CI
already produces. Both CI jobs append its table to the job summary
("🧭 Failure triage"), so read that first. To run it yourself:

```bash
# pytest (tests/unit, tests/api, tests/contract, tests/services)
python -m pytest <paths> --json-report --json-report-file=report.json
python scripts/failure_classifier.py report.json            # markdown
python scripts/failure_classifier.py report.json --format json

# Playwright TypeScript (e2e/): merged JSON report from pw-ts.yml's
# merge-reports job, or a local run with --reporter=json
python scripts/failure_classifier.py e2e/test-results/results.json
```

It is rule-based and conservative: no LLM, first matching rule wins
(infra → test-code → product), and anything it can't place is `unknown`.

## 2. Confirm it, then act by category

The classifier reads one error message. Before acting, confirm the verdict
against the full log: the traceback, the Playwright trace or screenshot,
and the test's history in `git log -p <test file>`.

| Category | Owner | Confirm by | Do | Never |
|---|---|---|---|---|
| `product` | Developers | Reproducing it against the app (TestClient, `curl`, or the browser), not just reading the test | Fix product code, or file an issue with the repro and the failing assertion | Edit, loosen, skip or invert the assertion. For Playwright specs (`e2e/**/*.spec.ts`), `assertion-guard.yml` blocks that anyway |
| `test-code` | Automation / QA | Product behavior being correct by hand, and the test being what's wrong (stale locator, broken fixture, bad import, wrong test data) | Fix the test. For Playwright locator or timing drift, hand it to the `playwright-test-healer` agent | Change product code to suit a broken test |
| `infra` | DevOps / environment | The same error naming a service, network or runner, not the code under test | One rerun of the job, at most. If it fails again, it's real: check the environment (Vercel, DB, GitHub API rate limit, runner disk) | Push a code change, or an empty commit to "kick" CI |
| `unknown` | Human | Reproducing locally | Reproduce, then put it in one of the three above | Guess |

When the classifier and the evidence disagree, the evidence wins. Say so
in the PR or issue ("classifier said test-code; it's a product regression
because…"); that disagreement is how the rules in the script get better.

## 3. Ownership signals in this repo

- An assertion failing on a test that passed on `main` usually means the
  change under test broke behavior, so treat it as `product` until proven
  otherwise.
- Tests that fail once and pass on the `--reruns 1` retry are **flaky**,
  not any of the three above. `scripts/flake_report.py` tracks them in one
  GitHub issue. Fix the cause; never rely on the rerun.
- `tests/contract/test_openapi_contract.py::…[POST /api/users]` is a known
  flake under full-suite load (see the steward skill).
- The app's own *test-run* triage (`POST /api/runs/{id}/triage?agentic=true`,
  `api/triage_agent.py`) uses the same idea for the test cases users run
  in TestFlow: `product_bug` / `flaky` / `environment` / `unknown`. This
  skill is its counterpart for the repo's own CI suites.

## 4. Improving the classifier

New failure signature it got wrong or left `unknown`? Add the pattern to
the right list in `scripts/failure_classifier.py` and a case to
`tests/unit/test_failure_classifier.py` with the real message. Keep the
patterns case-sensitive and specific: an HTTP status needs context
(`Response [503]`, `503 Service Unavailable`), because a bare `503` also
matches a stack line like `app.ts:503:7`.
