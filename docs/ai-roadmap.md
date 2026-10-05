# AI Building-Blocks Roadmap (M7–M10)

The first six course milestones (M1–M6) put LLMs, retrieval, evals, and a
human-approval orchestrator into this repo. This roadmap closes the honest
gaps those milestones left, one building block at a time, so each of
**LLMs · RAG · tool use · evaluations · human-in-the-loop** is backed by
production code *and* a test that proves it — not a README claim.

| # | Milestone | Building block | Gap it closes | Status |
|---|-----------|----------------|---------------|--------|
| M7 | Agentic failure triage (tool use) | Tool use | Product LLM calls were single-shot; tool use only existed in authoring-time Claude Code agents | ✅ Done |
| M8 | Real embeddings behind `get_embedding()` | RAG | Retrieval used a hashed bag-of-words vector, not a learned embedding model | ✅ Done |
| M9 | In-app human review of AI drafts + feedback loop | Human-in-the-loop · Evals | HITL existed only in the headless LangGraph illustration; human decisions never fed back into evals | 🟡 Planned |
| M10 | Trajectory evals for the triage agent | Evaluations · Tool use | The eval harness scores final text only, not *which tools* an agent chose to call | 🟡 Planned |

---

## M7 — Agentic failure triage (tool use) ✅

**What:** `POST /api/runs/{id}/triage?agentic=true` turns AI Failure Triage
from one prompt into a bounded **Anthropic tool-use loop**
([`api/triage_agent.py`](../api/triage_agent.py),
[`api/ai_gateway.py`](../api/ai_gateway.py) `complete_with_tools()`). The
model is handed the failing results and can *choose* to investigate before
diagnosing:

| Tool | Answers | Backed by |
|------|---------|-----------|
| `get_test_case_history` | "Is this a new regression or has it flip-flopped before?" | `test_results` joined to `test_runs` |
| `get_similar_test_cases` | "Which neighbouring scenarios might share the root cause?" | M5 retrieval (`api/retrieval.py`) |
| `get_suite_flaky_tests` | "Is this suite known-flaky?" | Same flip-count rule as `GET /api/suites/{id}/flaky-tests` |

**Guardrails (the part that matters in production):**
- **Bounded loop** — `max_iterations` (default 4); on hitting the cap the
  agent is forced to answer with what it has, never loops forever.
- **Scoped tools** — every tool is bound to the run's own suite; a
  model-supplied `testcase_id` from another suite returns an error to the
  model, not data (the model's arguments are untrusted input).
- **Tool errors go back to the model**, as `is_error` tool results, rather
  than crashing the request — the model can recover or answer anyway.
- **Full trace returned** — the response's `tool_calls` lists every call
  (name, input, short result preview), so a human reviewer sees *why* the
  agent concluded what it did, and the UI can render it.
- **Opt-in, backward compatible** — without `agentic=true` the endpoint is
  byte-for-byte the old single-shot call; non-Anthropic providers fall back
  to single-shot and say so (`mode: "single_shot"`).
- **Same telemetry** — token counts are summed across every loop turn and
  logged through `log_ai_call()` as feature `triage_agentic`.

**Done when:** API tests prove a scripted multi-turn tool loop
(tool_use → tool_result → final text), the iteration cap, cross-suite
scoping, and the fallback — all with a fake Anthropic client, no API key.

## M8 — Real embeddings behind `get_embedding()` ✅

**What:** add an `EMBEDDING_PROVIDER` switch (`hash` default · `ollama`
`nomic-embed-text` · a hosted API) behind the existing `get_embedding()`
seam, storing the model name alongside each vector so a provider change
triggers a re-embed instead of silently comparing incompatible vectors.

**Done when:** a retrieval eval shows a measurable win for the learned
embedding vs. the hashed baseline on the same dataset — or documents that
it doesn't at this scale, which is also a valid result.

**Result.** `api/embeddings.py`'s `embed_texts()` routes on
`EMBEDDING_PROVIDER` (`hash` default · `ollama` · `voyage`), always
L2-normalizing so cosine stays a dot product. `api/retrieval.py` stores the
`embedding_model` next to each vector (additive column + startup
migration; pre-M8 `NULL` rows count as the hash vector), re-embeds stale
rows in one batch when the provider changes, and on a provider failure
redoes the *whole* ranking on the hash vector — a learned query vector is
never compared against hashed case vectors.

The measurement is a new, deterministic retrieval eval
([`evals/retrieval_eval.py`](../evals/retrieval_eval.py),
[`evals/datasets/retrieval.json`](../evals/datasets/retrieval.json)): 18
queries across 3 suites, each reworded from the case it should find
("Forgot-my-password mail never arrives" → "Password reset email is sent").

| Provider | Model | Recall@1 | Recall@3 | MRR |
|----------|-------|---------:|---------:|----:|
| hash | `hash-bow-128` | 0.556 | 0.722 | 0.666 |
| ollama | `nomic-embed-text` | **1.000** | **1.000** | **1.000** |

Honest caveat: 18 hand-written queries is a small set and the learned
model saturates it — the result proves the direction and size of the gap
(the hashed vector ranked some correct cases 5th–8th of 8), not a
production-grade accuracy figure. Growing the dataset with harder negatives
is the natural next step. CI runs both providers on every eval-relevant PR
(`eval-harness.yml`), gating the learned model at Recall@3 ≥ 0.9.

The default stays `hash`: the Vercel production deployment has no local
model service, and `voyage` is opt-in because it's a paid API.

## Reliability gaps

The milestones above are organised by building block. These are organised
by the ways AI-in-QA agents actually go wrong in practice, and what in this
repo stops each one.

| Failure mode | Status | Guard |
|--------------|--------|-------|
| Failure investigation: an agent can't tell a product bug from a flaky test or an environment issue | ✅ Done | Structured triage verdicts + heuristic cross-check + verdict eval (below) |
| Self-healing: an agent fixed a selector but changed what the test verifies | ✅ Done | Assertion guard in CI (below) |
| CI failures: a red test of the repo's own suites gets fixed by the wrong owner | ✅ Done | `scripts/failure_classifier.py` (product / test-code / infra in the job summary) + `failure-triage` skill |
| Agent workflows: wrong tools, lost context, needed a human | 🟡 Partial | Bounded loop, scoped tools, full trace (M7); disagreement → human review; trajectory scoring is M10 |
| Evaluation: are the agent's decisions correct *and* repeatable? | 🟡 Partial | Verdict eval scores the heuristic baseline (accuracy, confident errors, repeatability); scoring the live agent on the same set is M10 |
| Test generation: generated tests pass but miss business scenarios | 🟡 Partial | Grounded generation + Test Plan Reviewer critic; a scenario-coverage scorer is a natural M9 follow-up |

### Bug vs flaky vs environment ✅

**What:** agentic triage now ends with one **structured verdict per failing
case** — `product_bug` · `flaky` · `environment` · `unknown` — recorded through
a `record_verdict` tool rather than parsed out of prose, so it is
machine-checkable. A new `get_run_environment_status` tool gives the agent
the evidence it was missing: the run environment's health and how the same
case did on the *other* environments. (Health is the deterministic simulation
in `api/environment_health.py`; the seam is where a real k8s/metrics probe
would plug in.)

Every case also gets a deterministic `heuristic_verdict()` from the same
evidence (`collect_evidence()`): unhealthy env + passes elsewhere →
environment; ≥ 2 pass/fail flips → flaky; green recent history, or failing
everywhere on a healthy env → product bug; otherwise unknown. The response
carries both, and **`needs_human_review` is set when they disagree, when the
agent skipped a case, or when it said `unknown`** — the agent never silently
wins an argument with the baseline. Single-shot mode returns the heuristic
verdicts.

**Measured:** [`evals/triage_verdict_eval.py`](../evals/triage_verdict_eval.py)
on 16 human-labelled cases
([`evals/datasets/triage_verdicts.json`](../evals/datasets/triage_verdicts.json)),
including deliberately hard ones. It separates *abstaining* (`unknown`, which
routes to a human — acceptable) from a *confident error* (a wrong verdict that
sends someone chasing a product bug that was really a dead pod — not
acceptable):

| Classifier | Accuracy | Coverage | Precision | Confident errors | Repeatable |
|------------|---------:|---------:|----------:|-----------------:|:----------:|
| heuristic baseline | 0.75 | 0.75 | **1.00** | **0** | ✅ |

The 4 abstentions are cases the evidence genuinely doesn't settle (no
history at all; env down *and* failing elsewhere). Unit tests gate
`confident_errors == 0`. Scoring the live agent on the same set needs an API
key and is part of M10.

### Assertion guard ✅

**What:** the healer prompt already forbids deleting or loosening an
assertion, and `scripts/heal_metrics.py` measures whether the healer *said*
it complied. [`scripts/assertion_guard.py`](../scripts/assertion_guard.py)
checks what the diff actually *does*: for every changed `e2e/**/*.spec.ts`
(comments stripped, so commenting an `expect()` out counts as removing it) it
blocks fewer `expect()` calls, new `skip`/`fixme`, more loose matchers
(`toBeTruthy`, `toBeDefined`, …) and more `.not` inversions, and lists every
changed expected value as a warning for a human. A selector-only heal touches
none of these and passes. The override is a human decision, visible in
review: the `assertion-change-approved` PR label or a
`// assertion-change-approved: <reason>` comment in the spec — the healer is
told never to write that marker itself.

**Back-test:** run over every spec-changing commit in the repo's history (19),
it flagged exactly one — a commit that inverted an assertion because the
product behaviour was intentionally removed. That is the case the human
approval exists for.

## M9 — In-app human review of AI drafts + feedback loop 🟡

**What:** AI-generated test cases already land as `draft`. Add an explicit
review step — accept / edit / reject-with-reason — recorded per case, and a
script that exports reviewed pairs (prompt, model output, human verdict,
human edit) into `evals/datasets/` as new eval cases.

**Done when:** a rejection in the UI shows up as a failing-then-fixed eval
case, closing the loop *human judgement → eval dataset → prompt change →
regression check*.

## M10 — Trajectory evals for the triage agent 🟡

**What:** extend `evals/` with a target that runs M7's agent against seeded
fixtures and scores the **trajectory** — did it call `get_test_case_history`
for a case with a flip-flopping history? did it stay under the iteration
cap? — alongside the existing text-quality scorers.

**Done when:** the eval report has a tool-selection accuracy metric with a
baseline, and CI flags a prompt change that makes the agent stop
investigating.
