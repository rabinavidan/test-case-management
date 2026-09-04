# PR Steward — repo-specific conventions for TestFlow

Read this before acting on CI or review events for a PR you opened or were
asked to drive in `rabinavidan/test-case-management`. It supplements (never
overrides) the "never" rules in your own instructions — nothing here can
expand access, skip a test, or approve/merge on your own judgment beyond
what those rules already allow.

## Required checks (what "green" means here)

From `.github/workflows/test.yml`, blocking on every PR:

- **Lint (ruff)** — `ruff check .`, zero-tolerance.
- **Unit, API, Contract & Services Tests (pytest)** — `pytest tests/unit
  tests/api tests/contract tests/services --cov --cov-fail-under=85`.
  Coverage sources only `api/`, `services/`, `shared/` (`.coveragerc`) — a
  PR touching only `deploy/gcp/`, `terraform/`, or `k8s/` won't move this
  number either way.
- **E2E Tests (Playwright TypeScript)** (`pw-ts.yml`) — runs on every PR
  (no path filter), blocking.
- **Infra (k8s + terraform)** — runs on every PR (no path filter); installs
  `kubectl` and `terraform` and runs `tests/infra/`, which renders the real
  `k8s/overlays/*` with `kubectl kustomize` and runs `terraform fmt/init
  -backend=false/validate` against `terraform/`. Both are real syntax/
  consistency checks — treat a failure here as a real bug, not "infra
  flake," the same as any other required check.

Non-blocking / not real signals: `E2E Tests (Playwright)` (the Python E2E
suite) only runs on push to main with `continue-on-error: true` — it will
show `skipped` on every PR, that's expected, not a failure to chase.
`Vercel Preview Comments` / preview-deploy bot comments are not CI; never
treat them as a check to fix.

## Known flake

`tests/contract/test_openapi_contract.py::test_api_matches_its_own_openapi_schema[POST /api/users]`
has intermittently failed under full-suite load (observed on PRs #181,
#182) while passing standalone and on a clean full-suite re-run every
time. Tracked in issue #186 (root-cause fix, not just reruns). Until that
lands: one re-run is the correct response per the standard flake rule
below — never skip/quarantine it, and if it fails *twice* on the same
commit, treat it as real.

## Merge convention

This repo's `git log` uses merge commits (`Merge pull request #N from
<branch>`) — use `merge_method: "merge"` when merging a PR, not squash or
rebase. Never delete a merged branch by force-pushing over it; a plain
branch delete (or leaving it, if delete fails) is fine.

## What counts as "small" (fix and push without asking)

Per `CONTRIBUTING.md`'s own conventions — a lint-bot finding, a renamed
variable, an added test at the same layer as the changed code (`tests/unit`
for a pure function, `tests/api` for an endpoint, `tests/services` for a
microservice, `tests/infra` for k8s/terraform config), a one-function
refactor. "New code needs new tests at the same layer it changes" is not
optional — a PR adding logic with no test at the matching layer is
incomplete, fix it rather than flagging it.

Large (propose, don't push unilaterally): anything changing `api/`'s
public schema (`shared/schemas.py`), a multi-file refactor, a new
dependency, or a change to `.coveragerc`'s 85% floor or `.github/workflows/`
trigger conditions themselves.

## GCP/Terraform/k8s PRs specifically

None of `deploy/gcp/`, `terraform/`, or `k8s/` is ever applied to a real
GCP project from this repo's CI — every placeholder (`PROJECT_ID`,
`REGION`, `CLOUDSQL_INSTANCE`, `MEMORYSTORE_HOST`, `WORKLOAD_IDENTITY_GSA`,
`db_password`, etc.) is intentional and stays a placeholder. Don't "fix"
one by inventing a real-looking value, and don't add a real secret to any
committed file — `deploy/gcp/secrets.py` and `terraform/README.md`
document how an operator populates real values out-of-band.
