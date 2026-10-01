# Changelog

All notable changes to this project are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

`VERSION` is bumped automatically by CI (`.github/workflows/bump-version.yml`)
on every merge to `main`, so a version number doesn't always correspond to a
user-visible change — this file tracks the changes worth knowing about, not
every patch bump. History before this file existed is visible in `git log`
but isn't retroactively cataloged here.

## [Unreleased]

### Added
- **Trajectory evals for the triage agent (course milestone M10)** —
  `evals/triage_trajectory_eval.py` + `evals/datasets/triage_trajectories.json`
  seed 8 scenarios into an in-memory DB, run the production agent path and score
  what it did: tool-selection accuracy, investigation rate, verdict
  coverage/accuracy, confident errors, cap hits, tool errors, repeatability.
  `--record-baseline` / `--gate` against `evals/baselines/<model>/triage_trajectory.json`
  (prompt hash recorded); `eval-harness.yml` gates `qwen2.5:3b` tool selection (0.93
  baseline, tolerance 0.20, 2 repeats) and now triggers on `api/triage_agent.py` / `api/ai_gateway.py`.
- **Triage verdicts are final** — `record_verdict` rejects a second verdict for the same
  case (first write wins). Found by the M10 eval: qwen2.5:7b recorded the right verdict,
  then overwrote it; after the fix its verdict accuracy went 0.00 → 0.40 and
  repeatability 0.50 → 0.90. Reported as `re_verdict_attempts`.
- `complete_with_tools(provider="ollama")` — the tool-use loop over Ollama `/api/chat`
  tool calling. The agentic triage endpoint now runs through
  `triage_agent.collect_problems()` + `run_triage_agent()`, shared with the eval.
- **Triage verdicts: bug vs flaky vs environment** — agentic triage now classifies every failing
  case through a `record_verdict` tool (`product_bug` · `flaky` · `environment` · `unknown`) after a
  new `get_run_environment_status` tool (env health + the case's result on other environments).
  A deterministic `heuristic_verdict()` cross-checks it; disagreement or `unknown` sets
  `needs_human_review`. `TriageResponse.verdicts` (additive) carries both; the triage modal shows a
  verdict badge and a *Needs human review* badge. Single-shot mode returns heuristic verdicts.
  Environment health moved to `api/environment_health.py`.
- `evals/triage_verdict_eval.py` + `evals/datasets/triage_verdicts.json` — 16 labelled cases;
  reports accuracy, coverage, precision, confident errors and repeatability. Heuristic baseline:
  precision 1.00, 0 confident errors, coverage 0.75 (gated in unit tests).
- **Assertion guard** — `scripts/assertion_guard.py` + `.github/workflows/assertion-guard.yml`
  block a PR whose spec changes remove, disable, loosen or invert an assertion (a heal must not
  change what a test verifies); the `assertion-change-approved` label or an in-file
  `// assertion-change-approved: <reason>` is the human override.
- **Pluggable embeddings for RAG (course milestone M8)** — `EMBEDDING_PROVIDER`
  selects `hash` (default, unchanged), `ollama` (`nomic-embed-text`), or `voyage`
  (`api/embeddings.py`). `test_case_embeddings.embedding_model` records which model
  produced each vector (additive column + startup migration); retrieval re-embeds
  rows from a different model and falls back to the hash vector on provider failure.
- `evals/retrieval_eval.py` + `evals/datasets/retrieval.json` — Recall@k/MRR per
  embedding provider; wired into `eval-harness.yml`. `nomic-embed-text` scores
  R@1 1.00 vs 0.56 for the hashed vector.

### Added
- **GraphQL + WebSocket tests in Java** (GraphQL/WebSocket plan — PR 5 of 5) — `java-tests/`:
  `GraphQLApiTest` (REST Assured against `/graphql`), `RunWebSocketTest` and
  `GraphQLSubscriptionTest` over the JDK's own `java.net.http.WebSocket` (no new dependency,
  helper `support/WsClient`); `java-e2e/`: `LiveCollaborationTest` (two browsers on one run, and a
  GraphQL mutation observed on the page's WebSocket frames).
- **GraphQL + WebSocket tests in TypeScript and BDD** (GraphQL/WebSocket plan — PR 4 of 5) —
  `e2e/tests/graphql.spec.ts` (GraphQL API against a real backend), `e2e/tests/realtime.spec.ts`
  (WebSocket protocol and close codes from the browser, two-browser live collaboration, a
  GraphQL mutation driving the live view, a browser graphql-transport-ws subscription),
  `e2e/tests/mocked-serverless-realtime.spec.ts` (`page.routeWebSocket()` as the server: pushed
  events, malformed frames, a 4401 close, the keep-alive ping), and
  `e2e-bdd/features/live_collaboration.feature`.

- **GraphQL subscriptions** (GraphQL/WebSocket plan — PR 3 of 5) — `subscription { runUpdates(runId) }`
  over **graphql-transport-ws** on `/graphql`, streaming the same `result_updated` /
  `results_populated` events as `/ws/runs/{id}` (both transports now share `ws_manager`'s
  broadcaster, so a REST write and a GraphQL `updateResult` reach both). Token in the
  `connection_init` payload (`authToken` or `Authorization: Bearer …`); DB connection released
  once the subscription starts; listeners cleaned up on `complete`/disconnect. Legacy
  `graphql-ws` protocol not offered.
- **GraphQL API** (`POST /graphql`, GraphQL/WebSocket plan — PR 2 of 5) — Strawberry schema in
  `api/gql/` over projects → suites → test cases → runs → results, with a computed
  `run.summary`. Nested reads are batched with request-scoped DataLoaders (a constant number of
  SQL statements regardless of row count); mutations delegate to the REST handlers, so
  permissions and validation rules are shared. Bearer auth on every operation, `extensions.code`
  (`UNAUTHENTICATED`/`FORBIDDEN`/`NOT_FOUND`/`BAD_REQUEST`) on errors, depth/alias/token limits,
  masked internal errors, and no introspection or GraphiQL in production. SDL committed as
  `docs/schema.graphql` and enforced by `tests/contract/test_graphql_schema.py`.
- **Hardened run-collaboration WebSocket** (`/ws/runs/{id}`, GraphQL/WebSocket plan — PR 1 of 5) —
  the socket now requires `?token=<JWT>` (close `4401` otherwise) and an existing run
  (close `4404`), answers JSON `{"type":"ping"}` with `{"type":"pong","ts":…}` alongside the
  legacy text `ping`/`pong`, and replies `{"type":"error"}` to malformed frames without
  dropping the socket. Same protocol in the monolith and `services/runs` (`shared/ws_protocol.py`);
  the gateway bridge forwards the token and relays 4xxx close codes. Contract in
  `docs/asyncapi.yaml`, enforced by `tests/contract/test_asyncapi_contract.py`.
- **Agentic Failure Triage (course milestone M7)** — `POST /api/runs/{id}/triage?agentic=true`
  runs a bounded Anthropic tool-use loop (`api/ai_gateway.complete_with_tools()`,
  `api/triage_agent.py`) with three suite-scoped, read-only tools: case history,
  similar cases (RAG), and suite flakiness. The response adds `mode`, `tool_calls`,
  and `hit_iteration_cap`; the run-page AI Triage modal shows the tool trace.
  Default (no flag) behaviour is unchanged.
- `docs/ai-roadmap.md` — M7–M10 plan for closing the remaining gaps across LLMs,
  RAG, tool use, evals, and human-in-the-loop; linked from the README and shown on
  the guest home page's AI-First Quality Engineering section.

### Fixed
- `e2e/tests/guest-recruiter-fixes.spec.ts` counted *all* projects to prove a guest click
  created none, so any spec creating or deleting a project in parallel could fail it; it now
  counts only demo projects.

## [2.0.80] - 2026-08-29

Portfolio hardening pass — CI quality gate, test coverage reporting, and a
real security fix, done as four sequential PRs (#130-#132 and this one):

### Added
- `ruff` lint step in CI (`.github/workflows/test.yml`), enforced as a
  required check.
- Test coverage reporting via `pytest-cov` (`.coveragerc`), with an 85%
  floor enforced in CI and the coverage summary shown in the job summary.
- `validate_jwt_secret()` guard (`api/auth.py`, `services/common/jwt.py`) —
  refuses to start in production with an unset/placeholder `JWT_SECRET_KEY`.
- Rate limiting (5/minute per IP) on `/api/auth/login` and
  `/api/auth/register` via `slowapi`, in both the monolith and the
  microservices auth service.
- `.github/dependabot.yml`, `SECURITY.md`, `.github/CODEOWNERS`,
  `CONTRIBUTING.md`, this changelog.

### Fixed
- Several dead imports and a naming collision with `fastapi.status`
  surfaced by the new lint gate (`api/main.py`, `services/*/main.py`).
- A test that created a user via the API without asserting the response
  succeeded before relying on that user existing in a later step
  (`tests/services/test_auth_service.py`).

## Earlier

TestFlow's core feature set (projects/suites/test cases/runs, AI test
generation and failure triage, real-time WebSocket collaboration, the
microservices decomposition, four parity test stacks, the Contact Us flow,
the Log Center, Vercel Analytics, and everything else) was built up over
`main`'s history before this file was introduced — see `git log` for the
full record.
