# tests/ — every automated check in one place

One root, one folder per layer of the pyramid. Each folder owns its tool,
its command and its CI job, so "where does a test for X go?" has one answer.

```
tests/
├── conftest.py        # shared by every pytest layer: rate-limit off, failure log, auto layer markers
├── backend/           # pytest — the product's Python code (api/, services/, shared/)
│   ├── unit/          #   pure functions, no DB / HTTP / I/O
│   ├── api/           #   FastAPI TestClient against a per-test SQLite DB
│   ├── contract/      #   Schemathesis vs. OpenAPI, AsyncAPI and the GraphQL SDL
│   └── services/      #   each microservice in isolation (component level)
├── e2e/               # Playwright + TypeScript — the real UI, real backend or fully mocked
│   ├── tests/         #   specs: scenario + assertions only (lint-enforced)
│   ├── flows/ pages/ api/ data/ config/ fixtures/   # the layers under the specs
│   └── specs/         #   test plans written by the Playwright planner agent
├── infra/             # pytest — kustomize renders of the kind-lab overlays (no cluster needed)
└── tooling/           # pytest — the repo's own machinery: CI workflows, scripts/, agents/
                       #   and the evals harness
```

## Layer → tool → command → CI job

| Layer | Tests | Run locally | CI job (`.github/workflows/`) |
|---|---|---|---|
| `backend/unit` | 111 | `pytest tests/backend/unit` | `test.yml` — Unit, API, Contract & Services |
| `backend/api` | 319 | `pytest tests/backend/api` | same |
| `backend/contract` | 52 | `pytest tests/backend/contract` | same |
| `backend/services` | 170 | `pytest tests/backend/services` | same |
| `tooling` | 334 | `pytest tests/tooling` | `test.yml` (same job — it was part of `unit/` before) |
| `infra` | 38 | `pytest tests/infra` (needs `kubectl`) | `test.yml` — Infra (k8s + terraform) |
| `e2e` real backend | 272 per browser | `cd tests/e2e && npm test` | `pw-ts.yml` (2 shards × 3 browsers + mobile) |
| `e2e` mocked | 35 | `cd tests/e2e && npm run test:mocked` | `pw-mocked-e2e.yml` |
| `e2e` architecture | — | `cd tests/e2e && npm run lint && npm run typecheck` | `pw-ts.yml` — E2E lint |

`pytest` with no arguments runs every Python layer (1024 tests); `pytest -m
api` (or `unit`, `contract`, `services`, `tooling`, `infra`) runs one, via
the markers `conftest.py` adds from each test's folder.

## Where does a new test go?

- It imports `api/`, `services/` or `shared/` and needs no DB or HTTP → `backend/unit/`
- It drives an endpoint through `TestClient` → `backend/api/` (monolith) or `backend/services/` (microservice)
- It checks the API against its published schema → `backend/contract/`
- It drives the browser → `e2e/tests/`, through `flows/` and `pages/` (see `e2e/README.md`)
- It checks a workflow YAML, a script in `scripts/`, an agent in `agents/` or the
  evals harness → `tooling/`. These are real tests, but of the delivery
  machinery, not the product — keeping them out of `backend/unit` keeps the
  pyramid honest (before the split, 390 of the 501 "unit" tests were tooling).
- It renders the k8s manifests → `infra/`

## Not in here, on purpose

- `evals/` — LLM quality *measurement* (datasets, scorers, baselines), not
  pass/fail tests. Its harness code is tested in `tooling/`.
- `lab/` — a local kind cluster to run `e2e/` against; an environment, not tests.
