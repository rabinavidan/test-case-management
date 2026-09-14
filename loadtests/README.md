# Scalability / Load Tests

[Locust](https://locust.io/) scenarios against TestFlow's API — measuring two different things,
not just "does it survive load":

1. **General CRUD throughput and latency as concurrency increases** (`full_crud_flow`, `list_projects`).
2. **A live, quantified measurement of [issue #214](https://github.com/rabinavidan/test-case-management/issues/214)**
   (`delete_suite_race`) — a concurrent `GET` racing a cascading `DELETE`'s commit. Every eval-harness and
   agent-framework piece of this repo treats "measure it, don't assume it" as the whole point; this suite
   applies the same idea to a backend concurrency bug instead of an LLM prompt.

The same `locustfile.py` runs unmodified against **both** deployments this repo ships — the SQLite monolith
and the Postgres/Redis microservices stack — since both expose the identical `/api/*` surface. That's what
makes the comparison below (SQLite monolith vs Postgres microservices) an apples-to-apples one rather than
two different test suites measuring two different things.

## Why this is its own, isolated dependency set

`locust==2.46.5` requires `pytest>=8.3.3,<10` and a newer `gevent`/`greenlet` than this repo's pinned
`pytest==7.4.3` (needed for `schemathesis`/`pytest-playwright` compatibility, see
`requirements-test.txt`) and `greenlet==3.0.3` (needed by `playwright==1.46.0`) can tolerate — confirmed by a
direct, real conflict when co-installing. `loadtests/` doesn't import anything from `api/` or `tests/` anyway
— it's a standalone HTTP load generator — so `requirements-loadtest.txt` is never installed alongside
`requirements.txt`/`requirements-test.txt` in the same environment, locally or in CI.

```bash
python -m venv .venv-loadtest && source .venv-loadtest/bin/activate
pip install -r requirements-loadtest.txt
```

## Running against the SQLite monolith

```bash
TESTFLOW_DISABLE_RATE_LIMIT=1 uvicorn api.main:app --port 8000 &
locust -f loadtests/locustfile.py --host http://localhost:8000 --headless -u 25 -r 10 -t 60s --csv=report
```

(`TESTFLOW_DISABLE_RATE_LIMIT=1` — the same variable every other test suite in this repo uses — because
`/api/auth/login`'s 5/minute limit would otherwise throttle the shared admin login, though `_bootstrap_admin`
already keeps that to one call for the whole run.) Open Locust's web UI instead of `--headless` for live
charts: drop `--headless -u ... -r ... -t ...` and visit `http://localhost:8089`.

## Running against the Postgres/Redis microservices deployment

```bash
docker compose -f docker-compose.microservices.yml up -d --build
locust -f loadtests/locustfile.py --host http://localhost:8000 --headless -u 25 -r 10 -t 60s --csv=report
```

No `TESTFLOW_DISABLE_RATE_LIMIT` needed here — `docker-compose.microservices.yml` doesn't pass it through to
`auth`, and `_bootstrap_admin` only ever makes one login call for the whole run either way. This compose file
also seeds its own admin (`SEED_ADMIN_USERNAME`/`PASSWORD`, defaulting to `admin`/`admin123`) at container
startup, which is always present — so `_bootstrap_admin` falls back to logging in as *that* seeded admin
whenever its own `loadtest_admin` registration is closed and its own login also fails (see
`locustfile.py`'s `FALLBACK_ADMIN_USERNAME`/`FALLBACK_ADMIN_PASSWORD`). Against the monolith's normally-empty
SQLite DB, `loadtest_admin` registers successfully instead and that fallback never triggers — same file,
same scenarios, two different bootstrap paths depending on what it finds.

## Findings (SQLite monolith, this environment, 4 CPU cores)

| Concurrent users | Aggregate req/s | Median latency | p95 latency | `delete_suite_race` failure rate |
|---|---|---|---|---|
| 3  | ~37–44 | ~10ms  | ~26ms  | 0% (0/15–23 samples) |
| 10 | ~92.5  | 38ms   | 97ms   | **8.3% (11/132)** — issue #214 reproducing directly |
| 25 | ~75–78 (lower, not higher, than at 10) | 110–132ms (3x higher than at 10) | 240–290ms | 0/10–11 in short runs (too small a sample to read as "fixed" — see below) |

**The throughput drop from 10 to 25 concurrent users is the real finding, more than any single failure
count.** A system that scales adds throughput as concurrency rises, at the cost of latency, until it hits a
ceiling and plateaus. This one's throughput *fell* while latency roughly tripled — a classic signature of lock
contention, not capacity being exhausted. SQLite serializes writers at the file level; every `POST`/`DELETE`
in these scenarios is a write, and this suite's flows are write-heavy by design (that's what stresses the
issue #214 path). This is consistent with, not contradicted by, the `delete_suite_race` sample at u=25 showing
0 failures — at 10–11 requests total, that's nowhere near enough samples to conclude the race stopped
happening; it's simply consistent with a system so contended that requests increasingly queue up and
serialize *behind* the race window rather than landing inside it. Don't read "0 failures at higher
concurrency" as "less broken" without a much longer run to back it up.

## Findings (Postgres/Redis microservices, this environment, 4 CPU cores)

| Concurrent users | Aggregate req/s | Median latency | p95 latency | `delete_suite_race` failure rate | mark-result 404 rate |
|---|---|---|---|---|---|
| 3  | 40.3 | 11ms | 27ms | 0% (0/106) | 0% (0/249) |
| 10 | ~123 (7415 reqs / 60s) | 15ms | 35ms | 0% (0/286) | 0.25% (2/789) |
| 25 | 203.3 | 51ms | 120ms | 0% (0/514) | 0.08% (1/1261) |

Two findings, one reassuring and one new:

**Issue #214's race never reproduced here — 0 failures across 906 total `delete_suite_race` samples at
every concurrency level tested**, a sharp contrast with SQLite's 8.3% at u=10. The code path is the same
shape (a cascading `DELETE` then an immediate `GET`, both routed to the `projects` service, both still
synchronous SQLAlchemy under uvicorn's threadpool) — what's different is the database underneath it.
Postgres's MVCC gives every transaction a consistent snapshot instead of SQLite's single file-level write
lock, which plausibly closes or narrows the specific interleaving #214 depends on. **This is not the same
claim as "the underlying application bug is fixed"** — nothing in `api/main.py`'s or `services/projects/
main.py`'s transaction handling changed — only that this backend makes it much harder to land inside the
race window. A longer, higher-concurrency run would be needed before calling it fixed rather than just
harder to hit.

**A new, microservices-specific race, not present in the monolith at all: [issue #219](https://github.com/rabinavidan/test-case-management/issues/219).**
`full_crud_flow`'s mark-result step (`PUT /api/runs/{run_id}/results/{tc_id}`, immediately after creating
the run) intermittently 404s under load — 0.25% at u=10, 0.08% at u=25, never at u=3. Root cause: the
monolith's `create_run` populates every pending `TestResult` row synchronously in the same request; the
microservices `runs` service instead enqueues that work onto a Redis Stream for the `worker` container to
drain asynchronously (see `services/README.md`'s "Async (Redis Stream, work queue)" section), so a client
that (reasonably) tries to record a result right after creating a run can win the race against the worker.
This is an architectural trade-off of decoupling that work via a queue, not a regression from the boot-fix
in [#217](https://github.com/rabinavidan/test-case-management/issues/217) — filed separately with suggested
directions rather than worked around here.

## Monolith vs microservices — the actual comparison

| | SQLite monolith | Postgres/Redis microservices |
|---|---|---|
| Peak measured throughput | ~92.5 req/s (at u=10 — *fell* to ~75-78 at u=25) | 203.3 req/s (at u=25 — still climbing) |
| Latency trend | 3x jump from u=10 to u=25 (write-lock contention) | Scales smoothly with load, no cliff observed |
| issue #214 (delete/read race) | Reproduces directly, 8.3% at u=10 | Not observed in 906 samples across all levels |
| New failure mode found | — | [#219](https://github.com/rabinavidan/test-case-management/issues/219): async worker population lag, up to 0.25% |

The headline result: **the microservices deployment measurably scales further before showing contention
symptoms**, consistent with swapping SQLite's single-file write lock for Postgres's row-level MVCC and
moving one piece of request-time work off the hot path entirely (the Redis queue + worker). That
decoupling is exactly what introduces #219 — trading a database-level concurrency bug for an
application-level eventual-consistency one is a real trade-off, not a strict improvement, and worth stating
as such rather than declaring one deployment simply "better."

## Design notes

- **One shared admin token, bootstrapped once** (`events.test_start`, not per-simulated-user) — the load
  should land on the CRUD endpoints under test, not on repeated register/login calls. `/api/auth/register`
  only ever succeeds for the first user on a database anyway (see `api/main.py`'s `register` endpoint).
  `_bootstrap_admin` tries registering its own admin first, then logging in as it, then falls back to the
  microservices deployment's pre-seeded admin — see "Running against the Postgres/Redis microservices
  deployment" above for why a single bootstrap function needs all three paths.
- **The race check mirrors an existing, always-passing sequential test exactly** —
  `java-tests/.../SuitesApiTest.deletingASuiteRemovesIt` asserts `GET /api/suites/{id}/testcases` returns
  `404` right after `DELETE /api/suites/{id}`. Reusing that precise assertion (rather than inventing a new
  one) is what makes "this fails under load but never sequentially" a meaningful, apples-to-apples claim.
- **Failures are reported via `catch_response`/`response.failure(...)`, not exceptions** — so Locust's own
  failure-rate column and CSV output *are* the measurement; no separate log-scraping step is needed to find
  out how often the race reproduces at a given concurrency level.
- **Every task creates and deletes its own uniquely-suffixed resources** (`_random_suffix()`), so concurrent
  simulated users never collide with each other's data — the same discipline this repo's other test suites
  already use (`TestData.uniqueName()` in the Java suites, `RUN_ID`-suffixed names in `e2e/`).

## Future work

- A longer run (5+ minutes) at several concurrency steps against both deployments, to get statistically
  solid failure-rate curves rather than the handful of data points above.
- Once issue #214 has a fix, rerun this suite against the SQLite monolith as the regression check: the
  failure rate should drop to (near) zero at the same concurrency that reproduced it at 8.3% here.
- Once issue #219 has a fix, rerun against the microservices deployment the same way: the mark-result
  404 rate should drop to zero at u=10/25, the same concurrency levels that reproduced it here.
- Push concurrency well past 25 against the microservices deployment specifically — throughput was still
  climbing at u=25 (unlike the monolith, which had already turned over by then), so the actual ceiling
  hasn't been found yet.
