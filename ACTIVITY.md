# Activity Log

History of notable Claude Code sessions in this repo, so future sessions (human or AI) have context on
what was discussed, discovered, and decided — not just the final diff a commit message shows.

Add a new entry at the top for each notable session, written as a narrative: what was asked, what was
found along the way, what was decided and why, and what was verified. Skip raw tool output/noise — keep
it readable, but don't compress it down to a bare bullet list of the final changes.

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
