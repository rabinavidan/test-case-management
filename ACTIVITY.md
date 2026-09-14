# Activity Log

History of notable Claude Code sessions in this repo, so future sessions (human or AI) have context on
what was discussed, discovered, and decided — not just the final diff a commit message shows.

Add a new entry at the top for each notable session, written as a narrative: what was asked, what was
found along the way, what was decided and why, and what was verified. Skip raw tool output/noise — keep
it readable, but don't compress it down to a bare bullet list of the final changes.

---

## 2026-09-14 — Profile the Postgres/microservices deployment for real (Scalability Milestone 2b)

Follow-up to the Docker-boot-fix session below, once that PR merged: reused `loadtests/locustfile.py`
against `docker-compose.microservices.yml` — the actual point of Scalability Milestone 2 all along — now
that the stack could finally stay up.

**First run against the fixed stack found a load-test-script bug, not a production one**: 0 requests sent,
every simulated user erroring out. `_bootstrap_admin` tried registering/logging in as its own
`loadtest_admin` account, but this compose file seeds a *different* admin (`admin`/`admin123`, via
`SEED_ADMIN_USERNAME`/`PASSWORD`) at container startup — so registration was always closed by someone else,
and `loadtest_admin` itself never existed to log in as. Fixed `_bootstrap_admin` with a third fallback: try
registering → try logging in as itself → log in as the deployment's pre-seeded admin. Kept the file working
unmodified against the monolith too (where the DB starts empty and the first branch still succeeds).

**Ran the same three concurrency levels as the monolith session (3, 10, 25 users) for a real comparison, not
assumed symmetry.** Two findings:

1. **Issue #214's race never reproduced — 0 failures across 906 total `delete_suite_race` samples at every
   level**, a sharp contrast with SQLite's 8.3% at u=10. Documented carefully as "Postgres's MVCC plausibly
   makes this interleaving much harder to land inside," not "the application bug is fixed" — the same
   transaction-handling code runs unchanged in both deployments; only the database underneath differs.
2. **A new, previously-unmeasured, microservices-specific race, not present in the monolith at all**:
   `PUT /api/runs/{id}/results/{tc_id}` intermittently 404s under load (0.25% at u=10, 0.08% at u=25, never
   at u=3). Root cause: the monolith's `create_run` populates every pending result row synchronously in the
   same request; the microservices `runs` service instead enqueues that work onto a Redis Stream for the
   `worker` container to drain asynchronously, so a client that immediately tries to record a result can win
   the race against the worker. Filed as [issue #219](https://github.com/rabinavidan/test-case-management/issues/219)
   with suggested directions (synchronous-for-the-first-result, a retryable 409/425 instead of a bare 404,
   or documenting the eventual-consistency window as an explicit API contract) rather than silently worked
   around in the load-test script.

**Wrote the actual comparison**, not just two separate findings sections: a table (peak throughput, latency
trend, #214 reproduction, the new #219 finding) plus an explicit statement that this is a real trade-off —
Postgres's row-level concurrency control plus moving result-population off the request path both help
throughput and contention, but that same queue-based decoupling is exactly what introduces #219. Framed as
"which bug you get, not a strict win," matching this repo's general practice of not overclaiming from a
short run — throughput was still climbing at u=25 against microservices (unlike the monolith, already past
its peak by then), so the real ceiling wasn't found either.

**Verification**: ran the actual CI workflow's summary-parsing logic against real CSVs from the local runs
before trusting it in `.github/workflows/loadtest-microservices.yml` (mirrors `loadtest-sqlite.yml`'s
pattern, including its own issue-specific reproduction-rate callout, now for both #214 and #219). `ruff
check .` clean. Updated `loadtests/README.md` (new sections, not a rewrite of the existing monolith
findings), the root `README.md`'s Test Architecture table and a new engineering-practices bullet, and
`CONTRIBUTING.md`.

---

## 2026-09-14 — Fix the microservices Docker Compose stack, which had never actually booted (Scalability Milestone 2a)

Started Scalability Milestone 2 (profiling the Postgres/microservices deployment with Locust, the planned
follow-up to the SQLite load-test suite below) by starting the Docker daemon and running the documented
`docker compose -f docker-compose.microservices.yml up --build`. It built cleanly, then every one of the 5
services — gateway, auth, projects, runs, ai — and the worker crash-looped. The load-test milestone never
got far enough to send a single request.

**Root cause**: every service's `main.py` is written to be imported by its full dotted path
(`services.auth.main`, mixing package-relative imports for its own siblings with absolute imports for
`services.common.*`/`shared.schemas`) — exactly how `tests/services/` already runs these apps successfully
from the repo root. But `docker-compose.microservices.yml` built each of auth/projects/runs/worker/ai from
an isolated `services/<name>` context (which doesn't even contain `services/common/` or `shared/` to copy
in) and ran `uvicorn main:app`, importing `main` as a bare top-level module with no package context —
`ImportError: attempted relative import with no known parent package`. The gateway's own Dockerfile already
used the repo root as context but flattened `services/gateway/` into `/app` instead of preserving the path,
so its fully-qualified `from services.gateway.routes import ...` failed with `ModuleNotFoundError: No module
named 'services'`. Confirmed by reading every crash log, not assumed from one.

**Filed [issue #217](https://github.com/rabinavidan/test-case-management/issues/217)** documenting this
before fixing it, matching how issue #214 was handled — this is a real, previously-undiscovered bug in a
headline feature (the README lists "Microservice Architecture" prominently), not a hypothetical.

**Fix**: rebuilt `docker-compose.microservices.yml` and all 6 Dockerfiles to build from the repo root
(`context: .`, `-f services/<name>/Dockerfile`) and run via the full dotted module path (`uvicorn
services.auth.main:app`, `python -m services.worker.main`), copying in exactly what each service's real
import graph needs (`services/common/`, `shared/` where used, `services/runs/` for the worker, `VERSION` for
auth's `/api/version`, `static/` relocated to `services/gateway/static/` to match where gateway's own code
looks for it relative to `__file__`). Rebuilding surfaced a second, independent, previously-undiscovered bug
one layer deeper: `services/auth/main.py`'s `_seed_admin()` (which runs at import time to seed the admin
account from `SEED_ADMIN_*` env vars) does `from .database import SessionLocal`, but
`services/common/db.py`'s `build_db()` deliberately never exposes the `SessionLocal` it builds internally —
that name has never existed in `services/auth/database.py`. This code path had simply never executed
successfully before, blocked by the first bug. Fixed by giving `auth/database.py` its own `SessionLocal`
bound to the same engine, with a comment explaining why it needs one `common/db.py` doesn't provide.

**Validated for real**, not just written and hoped: brought the full stack up fresh (`down -v` then `up -d
--build`), confirmed all 8 containers stayed up instead of restart-looping, then ran a complete CRUD flow
through the gateway by hand — login as the seeded admin, create project → suite → test case → run, mark a
result (which requires the `worker` container to have actually drained the Redis `runs.populate` stream and
populated the pending `TestResult` row — a genuine async round-trip, not an in-process call), read the run
summary, and confirm the cascading-delete-then-404 sequence from issue #214 passes cleanly when run
sequentially (as expected — the race is concurrency-only). Local builds needed a sandbox-only workaround
(this environment's outbound HTTPS is intercepted by a proxy with a self-signed cert `pip` doesn't trust by
default inside a container) — added temporarily, confirmed the fix, then stripped it back out before
committing, since real CI has ordinary internet access and doesn't need it.

**Found the same isolated-build-context bug a second time**, in `deploy/gcp/gke_images.py` — its
`build_command()` generated `docker build services/<service>` for the GKE image-push path, the identical
mistake `docker-compose.microservices.yml` had. Fixed the same way (repo root context, `-f
services/<name>/Dockerfile`, gateway's oddly-named `Dockerfile_gateway` handled via a new
`dockerfile_path()` helper) and updated `tests/unit/test_gcp_gke_images.py`'s assertions to match — this
one had unit tests, so the fix couldn't ship without them passing.

**Closed the actual coverage gap**, not just the immediate bug: added
`.github/workflows/microservices-smoke.yml`, which builds and boots the real compose file and runs a live
CRUD flow through the gateway (the same one validated by hand above, written as a proper Python script
with a poll loop for the worker's async result population rather than a fixed sleep) on every PR/push
touching `services/`, `shared/`, or the compose file — because nothing in CI built or booted this stack
before, which is exactly how issue #217 shipped unnoticed. Verified the workflow's own logic (readiness
polling, the CRUD script, the register-vs-seeded-admin-login fallback it needed after discovering the seed
admin makes `/api/auth/register` always return 403 on this compose file) against the live local stack
before trusting it in CI.

**Verification**: `ruff check .` clean; full `pytest tests/unit tests/api tests/contract tests/services -n
auto --cov` — 547 passed, 89.1% coverage (floor is 85%). Updated `README.md` (Test Architecture table + a
new engineering-practices bullet), `services/README.md` (build-context explanation + the coverage-gap
note), and `CONTRIBUTING.md`. Scalability Milestone 2b (the actual Postgres/microservices load-test suite
this was blocking) is next, once this PR merges.

---

## 2026-09-14 — Add a scalability/load-test suite (SQLite monolith), quantifying issue #214 for real

Follow-up to the parallel-test-execution session, which found and filed issue #214 (a backend race:
concurrent GET can return 200 instead of 404 right after a cascading DELETE commits). Discussed the natural
next step — scalability testing — and agreed on two milestones: this one (SQLite monolith, a direct
companion to #214) and a second profiling the Postgres/microservices deployment for genuine scalability
numbers.

**Tool choice**: Locust (Python) — fits the stack best, scenarios are plain readable Python classes, has a
solid headless CI mode. Hit a real dependency conflict immediately: `locust==2.46.5` requires
`pytest>=8.3.3,<10` and a newer `gevent`/`greenlet` than this repo's pinned `pytest==7.4.3` (needed for
`schemathesis`/`pytest-playwright`) and `greenlet==3.0.3` (needed by `playwright==1.46.0`) tolerate —
confirmed by directly co-installing and watching pip complain, then double-checked that the earlier
`pip install locust` attempt had actually polluted the shared `/tmp/venv3` test venv (pytest silently became
9.1.1), which had to be rebuilt clean from the real pinned requirements before trusting it again for anything
else. Fix: `requirements-loadtest.txt` is its own file, in its own virtualenv, never combined with
`requirements-test.txt` — verified `requirements.txt` + `requirements-loadtest.txt` *do* coexist fine (only
the test-pinned file conflicts), so the CI workflow installs those two together to actually run the app.

**Built `loadtests/locustfile.py`** with two kinds of tasks: `full_crud_flow` (project → suite → test case →
run → mark result → read summary → delete, the everyday path) and `delete_suite_race`, which reproduces
issue #214 directly — create a suite, delete it, `GET` its test cases and assert `404`, the exact same
assertion `java-tests/.../SuitesApiTest.deletingASuiteRemovesIt` makes sequentially (where it always passes).
Reported via `catch_response`/`response.failure(...)` so Locust's own failure-rate column *is* the
measurement, no separate log-scraping needed.

**Validated for real, not just written and hoped**: started a real local `uvicorn` (SQLite) and ran actual
Locust load at three concurrency levels. First smoke run at 3 users found a bug in the load test itself
(created test cases defaulted to `status="draft"`, but `create_run` only pre-populates result rows for
`"active"` cases, so every mark-result call 404'd) — fixed by creating test cases as `active`. Real findings
once that was fixed: at 10 concurrent users, `delete_suite_race` failed **8.3% of the time (11/132)** — issue
#214 reproducing directly and repeatably under load, not hypothetically. At 25 concurrent users, throughput
*dropped* (75-78 req/s vs 92.5 at 10 users) while median latency roughly tripled (110-132ms vs 38ms) — a
classic lock-contention signature (SQLite serializes writers at the file level, and every task here is
write-heavy by design), not a capacity ceiling being approached. Documented in `loadtests/README.md` why the
0-failure race-check samples at 25 users are too small to read as "the race got better" rather than "requests
are queueing up outside the race window instead of inside it."

**Verification**: `ruff check loadtests/` clean; confirmed `requirements.txt` + `requirements-loadtest.txt`
install without conflict in a fresh venv; the CI job-summary script's CSV-parsing logic tested against the
real stats CSVs from the local runs before trusting it in the workflow. Updated the root `README.md`'s Test
Architecture table and `CONTRIBUTING.md`.

---

## 2026-09-14 — Parallelize test execution across every stack — and find a real backend race doing it

Follow-up request after the eval-harness/agent-framework plan wrapped: "let me know how to run tests in
parallel and add more workers in CI/CD," then "it should be designed as real projects that used in hi-tech
companies" — i.e. don't just flip `-n auto` and call it done; get the correctness story right first, the way
a team that actually ships this would.

**Found the blocker before writing any parallel config**: `tests/api/conftest.py` and
`tests/contract/test_openapi_contract.py` both hardcoded a *shared* relative SQLite file path
(`sqlite:///./test.db`, `sqlite:///./contract_test.db`) as a module-level global. Under `pytest-xdist`,
separate worker *processes* would concurrently `create_all`/`drop_all` against the same file on disk — a real
race, not hypothetical. Fixed by suffixing both paths with `PYTEST_XDIST_WORKER` (pytest-xdist's own env var,
`"gw0"`/`"gw1"`/... or `"master"` outside xdist) before adding `pytest-xdist==3.8.0` to
`requirements-test.txt` and `-n auto` to `test.yml`. Verified locally: 543 tests, same 89.13% coverage
(pytest-cov aggregates correctly across xdist workers), `--reruns`/`--json-report`/`--alluredir` all still
work — wall time dropped from ~125s to ~35s on 4 cores, run three times to rule out newly-introduced
flakiness. None found.

**Playwright TypeScript (`e2e/`) sharded the way Playwright's own docs recommend**: a `strategy: matrix` of 2
shards (`--shard=N/2`) each uploading a `blob` reporter (added to `playwright.config.ts`, CI-only via
`process.env.CI`), a `merge-reports` job combining them into one HTML/JSON report plus one merged Allure
report, and a stable-named `e2e` gate job (`needs: [e2e-shard, merge-reports]`) so a matrixed job doesn't
silently change whatever check name branch protection might reference.

**Then things got interesting.** Validating the Java suites (`java-tests/`, black-box REST Assured against a
live instance) the same rigorous way — A/B test, several runs each — found: 4/4 clean runs with JUnit 5
parallel classes disabled, 3/4 *failed* with it enabled, always on the same two tests:
`ProjectsApiTest.deletingAProjectRemovesItAndCascadesToItsSuites` and `SuitesApiTest.deletingASuiteRemovesIt`,
both getting `200` instead of `404` right after a cascading `DELETE` committed — a concurrent `GET` racing the
delete's commit and winning. Re-running the full Playwright suite (no sharding at all, just its own default
multi-worker concurrency) showed the same shape of failure on delete/mutate-then-verify specs, confirming this
is a pre-existing backend concurrency issue (SQLite + synchronous SQLAlchemy under uvicorn's threadpool,
most likely) that parallel Java execution exposed rather than caused — but *enabling* Java parallelism was
what would have shipped a suite failing 75% of the time.

**Decision**: shipped `pytest-xdist` and Playwright sharding (both verified safe — the Python side never hits
a live server at all, and the Playwright flakiness is pre-existing, not newly introduced by sharding).
Did **not** enable JUnit 5 parallel classes for `java-tests/` or `java-e2e/` — both ship
`junit-platform.properties` with `enabled=false` and a comment documenting exactly what was found and why,
rather than silently omitting the file or leaving no trace of the investigation. Filed
[issue #214](https://github.com/rabinavidan/test-case-management/issues/214) with the reproduction evidence
and suspected root cause, so the finding is tracked and actionable instead of buried in a PR description.

**A second, unrelated bug found and fixed along the way**: `java-e2e/support/BaseTest.java` stored its
`Playwright`/`Browser` instances in `private static` fields on the shared abstract base class — every
subclass's `@BeforeAll` wrote to the *same* static slot, so under concurrent test classes, one class's
`@AfterAll` closing "the" browser could pull it out from under another class's still-running tests. Fixed
with `ThreadLocal<Playwright>`/`ThreadLocal<Browser>` (Playwright's own documented pattern for JUnit 5 +
parallelism), verified by compiling `java-e2e` and running `LoginTest` end-to-end against a live app — kept
this fix regardless of Java parallelism staying disabled, since it's correct and forward-compatible for
whenever it's re-enabled.

**Verification**: `ruff check .` clean; full `pytest tests/unit tests/api tests/contract tests/services -n
auto` at 543 passed, 89.13% coverage; `java-tests` compiles and passes 35/35 sequentially (4/4 clean A/B
runs); `java-e2e` compiles and `LoginTest` passes with the `ThreadLocal` fix. Updated the root `README.md`'s
Test Architecture section and `CONTRIBUTING.md` with the real numbers and the honest state of each stack.

---

## 2026-09-13 — Case-study writeup tying the eval-harness + agent work together (Milestone 4 of 4, final)

Closing milestone of the 4-PR plan; Milestone 3 (#212) merged clean, including the pydantic/httpx bump holding
up fine in CI. This session was docs-only — no code changes — writing the interview/portfolio artifact the
whole plan was ultimately for.

**What got written**: `docs/interview-prep/agentic-ai-test-engineering.md`, following the existing
`docs/interview-prep/qa-automation-lead-nishapro.md`'s structure (requirement mapping table, honest gaps,
talking points, questions to ask them) rather than inventing a new format. Content-wise it's a synthesis, not
new material — pulling the real findings already documented in `evals/README.md` and `agents/README.md`
(the schema_score mean-0.5/stdev-0.5 consistency example, the ChatPromptTemplate brace-escaping bug, the
temperature/instruction fix for structured-output reliability, the httpx/pydantic dependency conflicts) into
one narrative aimed specifically at the gap that started this whole plan: evaluation-harness design for
non-deterministic systems, prompt engineering for test generation, and agent-framework familiarity.

**Deliberately included an "honest gaps" section**, matching the nishapro doc's own convention of not
overselling — the eval-harness CI job is informational only (no calibrated regression gate yet), only
LangChain was actually built (not AutoGen or CrewAI, despite all three being named in the original postings),
and the Test Plan Reviewer is CLI-only, not wired into the API. The instinct to skip these and just list
strengths would undercut exactly the "hands-on, not hand-wavy" credibility the whole 4-PR plan was built to
establish.

**Cross-linked from the root README**: added one line after the AI Engineering section's bullet list pointing
to the new doc, rather than leaving it discoverable only by browsing `docs/`.

**Process note**: this was the one milestone with no pytest/ruff gate to run (docs-only diff, confirmed via
`git status` before writing anything), so "tested locally" here meant checking every file path and link
referenced in the new doc actually exists (`api/ai_prompts.py`, `evals/harness.py`,
`evals/targets/__init__.py`, `agents/test_plan_reviewer.py`, `.github/workflows/eval-harness.yml`, etc.) rather
than running a test suite.

With this PR, the 4-milestone plan from the original CV-gap conversation is complete: eval harness foundation
→ real CI wiring + a second target → a LangChain agent → this writeup, each merged sequentially with green CI
before the next one started, per the user's explicit process rules.

---

## 2026-09-13 — Add a LangChain agent: Test Plan Reviewer (Milestone 3 of 4)

Continuation of the 4-milestone plan; Milestone 2 (PR #211) merged clean, including the new eval-harness.yml
workflow's first live run against a real model. This session's job was the part of the original CV-gap ask
that Milestones 1-2 didn't touch yet: "familiarity with agent frameworks (LangChain, AutoGen, CrewAI)" — every
agent in this repo so far (PR Steward, Coverage-Gap Agent, AI Test Generation/Triage) is a single-shot LLM call
hand-rolled against a plain HTTP client, which never needed a framework. Picked LangChain (of the three named)
per the earlier framework discussion with the user.

**Design**: rather than force a framework onto an existing single-call feature just to check a box, built
something that's actually shaped like a multi-step agent: a **Test Plan Reviewer** with a critic step (find
test-coverage gaps for a feature) feeding a drafter step (write test cases for those gaps) — the drafter's
prompt genuinely depends on the critic's output, which is the case LangChain's composable `prompt | llm |
parser` chains (LCEL) are for. Lives in a new top-level `agents/` directory, separate from `evals/`
(evaluation) and `scripts/` (CI automation), with `agents/test_plan_reviewer.py` (the pipeline) and
`agents/cli.py` (a `python -m agents.cli` entrypoint mirroring `evals/cli.py`'s conventions).

**Validated against a real model, and caught a real bug doing it**: pulled `langchain-core==1.6.3` and
`langchain-ollama==1.1.0` (latest stable) and ran the pipeline against the already-installed local
`qwen2.5:0.5b`. First issue: `ChatPromptTemplate` treats `{...}` as template variables, and the system prompts
embed literal JSON schemas in braces — had to double every brace (`{{"gaps": [...]}}`) to escape them; the
error message ("Input to ChatPromptTemplate is missing variables") made the cause obvious once seen. Second,
more interesting issue: at the default temperature (0.7, matching `evals/`'s default), the model returned
plain prose instead of JSON despite the system prompt demanding JSON-only, raising
`OutputParserException`. Lowering temperature to 0.2 and strengthening the instruction ("Respond ONLY with a
JSON object, no other text") fixed it in practice, though the code still doesn't assume it always will:
`review_and_fill_gaps` catches any exception from either step and re-raises as `PlanReviewError`, matching this
repo's "degrade with a clear error, don't crash" contract for AI features.

**Testing**: used LangChain's own `langchain_core.language_models.fake_chat_models.FakeListChatModel` to script
both steps' responses in unit tests — no real Ollama server needed, and it's the idiomatic way to test a LangChain
chain rather than mocking HTTP directly. 18 new tests across `tests/unit/test_test_plan_reviewer.py` and
`tests/unit/test_agents_cli.py`, including the `OutputParserException` failure path exercised directly since
it's a real observed failure mode, not hypothetical. Renamed the pipeline's exception from `TestPlanReviewError`
to `PlanReviewError` after noticing pytest tried (harmlessly, but noisily) to collect it as a test class because
of the leading "Test".

**A real dependency conflict, not a hypothetical one**: added `langchain-core==1.6.3` and
`langchain-ollama==1.1.0` to `requirements-test.txt` (only place they're needed — the FastAPI app itself doesn't
import LangChain), and a clean full-suite install immediately broke `tests/contract/test_openapi_contract.py`
with `TypeError: Client.__init__() got an unexpected keyword argument 'app'`. Root cause: `langchain-ollama`'s
`ollama` client dependency requires `httpx>=0.27`, and installing it bumped `httpx` past the repo's
`httpx==0.25.2` pin all the way to 0.28.1, which removed the `Client(app=...)` shortcut `starlette`'s
`TestClient` relies on. Fixed by pinning `httpx==0.27.2` instead — the newest release that still supports it,
and still satisfies `ollama`'s `>=0.27`. A second conflict followed: `langchain-core==1.6.3` requires
`pydantic>=2.7.4`, but `requirements.txt` pinned `pydantic==2.5.0` for the app itself. Since both files install
into one shared environment, bumped `requirements.txt`'s pin to `pydantic==2.13.5` (what pip actually resolved)
rather than downgrading `langchain-core` to dodge it, then reran the full suite against the bump before trusting
it — 543 passed unchanged, confirming the app doesn't depend on anything pydantic 2.5-specific.

**Verification**: ruff clean; full `pytest tests/unit tests/api tests/contract tests/services` gate re-run
end to end after both dependency fixes — 543 passed, 89.13% coverage (threshold 85%). Updated root `README.md`'s
AI Engineering table and "why this matters" list (a new bullet on using a framework only where one earns its
keep), `CONTRIBUTING.md`, and `agents/README.md` documenting both the design reasoning and the two real
failures (prompt-template brace escaping, the dependency conflicts above) hit along the way — that write-up is
itself part of the interview/portfolio story this whole plan is for.

---

## 2026-09-13 — Wire the eval harness into real CI + add AI Failure Triage target (Milestone 2 of 4)

Continuation of the previous session's 4-milestone plan. Milestone 1 (PR #210) merged clean, so this session
generalized the harness to a second AI feature and wired it into real CI, per the plan and the user's explicit
sequencing rule: one PR per milestone, never in parallel, merge before starting the next.

**Generalizing the harness**: `evals/harness.py` was test-generation-specific in M1 — hardcoded metric names,
hardcoded prompt imports. Refactored it around an `EvalTarget` (name, metrics, error_scores, build_prompt,
score) so the orchestration (run N times, aggregate mean + consistency, gate against thresholds) is identical
for any feature; `evals/targets/test_generation.py` and the new `evals/targets/triage.py` hold what's actually
feature-specific. Extracted `TRIAGE_SYSTEM_PROMPT`, `build_triage_user_prompt`, and
`format_triage_problem_line` out of `api/main.py`'s `triage_run` into `api/ai_prompts.py`, same reasoning as
M1's test-generation extraction — the harness evaluates production's real prompt, not a copy.

**New scorers for free text**: AI Failure Triage returns a plain-English summary, not JSON, so schema-based
scoring doesn't apply. Added `evals/triage_scorers.py`: non-empty, sentence-count-in-range (the prompt asks
for 3-5 sentences), keyword coverage, and a `verbatim_echo_rate` that catches a model pasting the input's
`[FAIL]`/`[SKIP]` bullet list back instead of synthesizing a diagnosis — directly checking the one instruction
the system prompt gives that a naive model is likely to ignore.

**Real-model validation, not just mocks**: installed Ollama locally in the dev sandbox (`curl -fsSL
https://ollama.com/install.sh | sh` needed `zstd` installed first) and pulled `qwen2.5:0.5b` to actually run
both targets end-to-end before writing a single CI line. This caught nothing broken, but it did prove the
design point: `login-flow`'s `schema_score` came back mean 0.5, stdev 0.5 across 2 real runs — one run's JSON
was schema-valid, the other wasn't. A harness that ran the prompt once would have reported whichever it
happened to get as "the" answer. That real result is now the running example in `evals/README.md`.

**CI wiring decision**: `.github/workflows/eval-harness.yml` installs Ollama and pulls `qwen2.5:0.5b` (~400MB,
fast on a CPU runner) to run both targets for real, writing a job summary — but deliberately **informational,
not a blocking gate**. A 0.5B model's output varies enough run to run that failing the build on it would be
noise; a real gate wants a calibrated per-model baseline first (tracked as Future work). Scoped to only
trigger on changes to `api/ai_prompts.py` or `evals/**`, since it downloads a model and makes several LLM
calls per case — not something every unrelated PR should pay for.

**Verification**: ruff clean; `pytest tests/unit tests/api tests/contract tests/services` at 525 passed,
89.13% coverage (threshold 85%, no flakes this run). 77 eval-related unit tests (up from 45 in M1) — all
mocked, none requiring a real Ollama server; the real-model runs above were a manual one-off check, not part
of the automated suite. Updated `evals/README.md`, root `README.md`'s AI Engineering table, and
`CONTRIBUTING.md`.

---

## 2026-09-13 — Add an eval harness for the AI Test Generation feature (Milestone 1 of 4)

Started from a CV-gap conversation, not a bug: the user found postings (NICE, Iguazio, SQLink) asking for
hands-on design of evaluation harnesses for non-deterministic systems, prompt engineering for test generation,
and agent-framework fluency (LangChain/AutoGen/CrewAI) — a real gap against this repo's existing agentic-AI
work. Agreed on a 4-milestone plan, one PR each, sequential (never in parallel), each complete with tests/docs
updated and CI green before moving to the next: (1) eval harness foundation, (2) wire it into CI + a second
dataset for AI Failure Triage, (3) an agent built with an actual framework (LangChain, still Ollama-backed —
the user wants zero API cost throughout), (4) a case-study writeup tying it together.

**What this milestone found**: this repo already had three LLM-powered features (AI Test Generation, AI
Failure Triage, the Coverage-Gap Agent) but nothing measuring their output quality or consistency — tests only
covered control flow (missing API key -> 503, bad JSON -> 502), never "is the model's actual output any good,
and how much does it vary run to run." That's the real gap the CV postings are naming.

**Design decisions**: extracted `api/ai_prompts.py` out of `api/main.py`'s `generate_testcases` endpoint so the
harness imports the exact production prompt instead of a copy that could drift. Built `evals/` around a plain
`httpx` client for a local Ollama server (`evals/ollama_client.py`) — no API key, no per-call cost, which is
what makes running each dataset case 5+ times practical. Scoring (`evals/scorers.py`) is deterministic only for
this first pass (schema validity, requested-count match, keyword coverage, duplicate-title rate) — no
LLM-as-judge yet, to avoid adding a second layer of non-determinism on top of the thing being measured.
`evals/harness.py` runs each case N times and reports both mean quality and the standard deviation across runs,
since a single passing run proves nothing about a model that can answer differently next time; an errored run
scores as a full failure rather than being excluded, so the harness can't hide flakiness by averaging it away.

**Verification**: added `tests/unit/test_ai_prompts.py`, `test_evals_scorers.py`, `test_evals_ollama_client.py`
(via `httpx.MockTransport`, matching `scripts/coverage_gap_agent.py`'s existing test pattern),
`test_evals_harness.py`, and `test_evals_cli.py` — 45 new tests, all mocked, none requiring a real Ollama
server. Ran the full gate locally before pushing: `ruff check .` clean, `pytest tests/unit tests/api
tests/contract tests/services` at 493 passed with 89.15% coverage (threshold 85%). Updated the README's AI
Engineering table and "why this matters" list, and added a short section to CONTRIBUTING.md.

---

## 2026-07-13 — Rewrite login page object for modal-based auth; establish test-before-push rule

Started from uncommitted local changes to `tests/pages/login_page.py` and `tests/test_login_e2e.py`,
with the ask "before commit push test changes all is ok" — i.e. verify the pending changes before
pushing to `main`.

**Diff review**: the changes rewrote the login page object and tests to match the app's actual auth flow
— sign-in is a modal (`[data-testid=signin-btn]` opening `#auth-form-container`), not a dedicated
`/login` route as the old page object assumed. The rewrite added `expect_logged_in`, `expect_login_error`,
and a new `test_login_invalid_credentials_shows_error` test, and dropped the old "create account link →
/signup" test since there's no `/signup` route in this app.

**Test run and failures found**: ran the fast API suite first (33 passed). Then ran the broader suite
(excluding `test_e2e.py` and `test_api_pw.py`, following an exclusion already established in this repo's
session history for `test_api_pw.py`) — this surfaced two E2E failures against production:
`test_login_e2e.py::test_login_success` and `test_users_e2e.py::test_user_management_full_flow`, both
timing out waiting for the `logout-btn` to appear after login.

**Root-cause investigation**: direct `curl` against the prod `/api/auth/login` endpoint with the default
E2E credentials (`e2eadmin`/`e2epass1`) confirmed `Invalid username or password`. `/api/debug/seed`
showed `admin_exists: false` with 3 existing users and no `SEED_ADMIN_*` env vars set on that deployment
— i.e. prod has no working admin account under the expected credentials. This is a deployment/data issue,
not a defect in the page-object rewrite. Also noted `.github/workflows/test.yml`'s E2E job only runs
`tests/test_e2e.py`, not `test_login_e2e.py` or `test_users_e2e.py`, so CI wouldn't have caught this
either way.

**Verifying locally instead**: started a local `uvicorn` server to check the UI directly. The local
`testcases.db` also lacked a working `e2eadmin`, but the user identified an existing local admin account
(`admin` / `262626`), confirmed via `curl`. Running `test_login_e2e.py` + `test_users_e2e.py` against
`http://127.0.0.1:8000` with those credentials: all 4 tests passed, confirming the failures were purely
environmental, not code defects.

**Full local suite**: asked to run everything, which surfaced one more pre-existing, unrelated failure —
`tests/test_e2e.py::test_logo_navigates_to_projects` — using
`expect(page).to_have_url(lambda url: ...)`, which Playwright's Python `to_have_url` doesn't support
(string/regex only). Confirmed via `git status`/`git log` that this file wasn't touched by the pending
diff.

**New standing rule**: the user then said "we should test any change and fix all failed tests before
push to main" and asked for this to be added as a durable rule. Added a "Workflow rules" section to
`CLAUDE.md` (run affected tests — fast API suite minimum, plus local E2E for frontend/page-object
changes, not just against prod — and fix all failures before pushing), and saved matching entries to
Claude's persistent memory (`feedback_test_before_push`, `project_prod_admin_credentials_broken`).

**Applying the new rule immediately**: rather than leave the `test_e2e.py` lambda bug as a known
pre-existing issue, fixed it (`re.compile(r"projects|/$")` in place of the lambda) since the new rule
says all failing tests should be fixed before push, not just ones caused by the current diff. Re-ran the
full suite: 51/51 passed (everything except `test_api_pw.py`, which still fails only against prod for
the same missing-admin reason — out of scope, since it requires either registering a fresh admin on an
empty DB or a known working credential pair that isn't currently available in prod).

**Outstanding, not fixed**: prod has no working admin account under any credentials tried
(`e2eadmin`/`e2epass1`); `test_api_pw.py` and any E2E test run directly against prod will keep failing
until `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD` are set on the Vercel deployment or a prod admin is
otherwise (re)established.

**Result**: `login_page.py`, `test_login_e2e.py`, `test_e2e.py`, `CLAUDE.md`, and this file were the
changes ready to commit/push at the end of the session, pending user go-ahead.
