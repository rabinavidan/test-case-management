# Scalability / Load Tests

[Locust](https://locust.io/) scenarios against TestFlow's API — measuring two different things,
not just "does it survive load":

1. **General CRUD throughput and latency as concurrency increases** (`full_crud_flow`, `list_projects`).
2. **A live, quantified measurement of [issue #214](https://github.com/rabinavidan/test-case-management/issues/214)**
   (`delete_suite_race`) — a concurrent `GET` racing a cascading `DELETE`'s commit. Every eval-harness and
   agent-framework piece of this repo treats "measure it, don't assume it" as the whole point; this suite
   applies the same idea to a backend concurrency bug instead of an LLM prompt.

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

## Design notes

- **One shared admin token, bootstrapped once** (`events.test_start`, not per-simulated-user) — the load
  should land on the CRUD endpoints under test, not on repeated register/login calls. `/api/auth/register`
  only ever succeeds for the first user on a database anyway (see `api/main.py`'s `register` endpoint).
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

- Profile the Postgres-backed microservices deployment (`docker-compose.microservices.yml`) the same way —
  see the root README's Test Architecture section for whether that's landed yet.
- A longer run (5+ minutes) at several concurrency steps to get a statistically solid `delete_suite_race`
  failure-rate curve, not just the two data points above.
- Once issue #214 has a fix, rerun this exact suite as the regression check: the failure rate should drop to
  (near) zero at the same concurrency that reproduced it at 8.3% here.
