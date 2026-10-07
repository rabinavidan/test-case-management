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
| M10 | Trajectory evals for the triage agent | Evaluations · Tool use | The eval harness scores final text only, not *which tools* an agent chose to call | ✅ Done |

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
| Agent workflows: wrong tools, lost context, needed a human | ✅ Done | Bounded loop, scoped tools, full trace (M7); disagreement → human review; M10 trajectory eval scores which tools it called, per case |
| Evaluation: are the agent's decisions correct *and* repeatable? | ✅ Done | Verdict eval scores the heuristic baseline; M10 scores the live agent's verdicts, confident errors and run-to-run repeatability on seeded scenarios |
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
`confident_errors == 0`. The live agent's verdicts are scored by M10's
trajectory eval below.

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

## M10 — Trajectory evals for the triage agent ✅

**What:** the text evals score what the agent *said*.
[`evals/triage_trajectory_eval.py`](../evals/triage_trajectory_eval.py)
scores what it *did*. Each of 8 scenarios in
[`evals/datasets/triage_trajectories.json`](../evals/datasets/triage_trajectories.json)
(10 labelled failing cases: flaky, fresh regressions, a dead and a degraded
environment, a bug failing on every environment, a flaky-looking history on
a dead environment, a skipped result that must not be classified) is seeded
into a throwaway in-memory database and run through the **production agent
path** — `triage_agent.run_triage_agent()`, the same function the
`/triage?agentic=true` endpoint now calls. Every failing case names the
evidence an investigator must look at before deciding (`history` or
`environment`); the trajectory is scored on:

| Metric | Question it answers |
|--------|---------------------|
| `tool_selection_accuracy` | Did it check the evidence each case needs, before finishing? |
| `investigation_rate` | Did it call any evidence tool at all? |
| `verdict_coverage` / `verdict_accuracy` | Did it classify every failing case, and correctly? |
| `confident_errors` | Wrong verdicts that weren't `unknown` |
| `cap_hit_rate`, `tool_error_rate`, `mean_tool_calls`, `re_verdict_attempts` | Did it loop, misuse tools, over-spend, or try to change a final answer? |
| `verdict_repeatability` | Same verdict for the same case across repeats? |

**A real model in CI, no API key:** `complete_with_tools()` gained an
Ollama backend (Ollama `/api/chat` tool calling, temperature 0, fixed seed)
next to the Anthropic one, sharing one tool dispatcher. Measured locally,
3 repeats × 8 scenarios per model:

| Model | Tool selection | Investigated | Coverage | Accuracy | Confident errors | Cap hits | Repeatable |
|-------|---------------:|-------------:|---------:|---------:|-----------------:|---------:|-----------:|
| qwen2.5:1.5b | 0.00 | 0.08 | 0.00 | 0.00 | 0 | 0.00 | 1.00 |
| qwen2.5:3b | **0.93** | 1.00 | 0.90 | 0.57 | 7 | 0.38 | 0.80 |
| qwen2.5:7b — before the fix below | 0.90 | 1.00 | 0.73 | 0.00 | 12 | 0.54 | 0.50 |
| qwen2.5:7b — verdicts made final | 0.90 | 1.00 | 0.73 | **0.40** | 6 | 0.54 | **0.90** |

What the numbers say:
- **1.5B writes a confident diagnosis without investigating.** It answered
  "the environment is healthy … the test has not failed in previous runs"
  without having called a single tool — and the case had flip-flopped. A
  text-quality scorer would rate that answer as fluent and specific; the
  trajectory eval scores it 0.
- **3B investigates well but over-calls "flaky".** All 7 confident errors
  are fresh regressions after a green streak labelled `flaky`. This is the
  failure mode R1's heuristic cross-check exists for: in production each of
  these cases disagrees with the heuristic (`product_bug`) and is flagged
  *Needs human review*.
- **7B found a real bug in the agent, not just in itself.** It investigated
  (tool selection 0.90) yet scored 0.00 accuracy. The trajectory showed why:
  it recorded the *correct* verdict first (`environment`), kept calling
  tools, then recorded again — `flaky` or `unknown` — and `record_verdict`
  was last-write-wins although the prompt says "exactly once". Verdicts are
  now final (first write wins; a second call returns an error telling the
  model so) and the eval reports `re_verdict_attempts` (19 rejected for 7B).
  Same model, same prompt, after the fix: accuracy 0.00 → **0.40**,
  confident errors 12 → 6, repeatability 0.50 → **0.90**. That is the loop
  this milestone exists for: measure → read the trajectory → fix → re-measure.
- **7B still has an open failure mode:** in 8 of 24 runs it ends a turn with
  neither text nor a tool call (`failed_runs`), and 54% of runs hit the
  iteration cap — both reported, neither hidden.
- **Repeatability is not free:** 3B gave a different verdict for 20% of
  cases across identical runs, even at temperature 0 with a fixed seed.

**Gate:** `eval-harness.yml` runs the eval on `qwen2.5:3b` and `--gate`s it
against the committed baseline
([`evals/baselines/qwen2.5_3b/triage_trajectory.json`](../evals/baselines/qwen2.5_3b/triage_trajectory.json),
which records the system-prompt hash it was measured with) on
`tool_selection_accuracy`, tolerance 0.20, averaging 2 repeats per scenario.
Coverage and accuracy are reported but not gated — they were tried and
dropped: on a 3B model they move by whole cases between identical runs
(repeatability 0.8), and CI runners measured coverage 0.75–0.90 against
0.90 locally, which put the gate on the noise line. Tool selection measured
0.80–0.93 in every environment, while an agent that stops investigating
scores ~0.0 — that gap is what the gate exists to catch. The job
now also triggers on `api/triage_agent.py` and `api/ai_gateway.py`, so a
prompt edit is measured before it merges; `--system-prompt-file` scores a
candidate prompt locally first.

**Proof the gate catches what it is for:** `tests/unit/test_triage_trajectory_eval.py`
drives two scripted agents through the real loop with no key or model — an
investigator (scores 1.0) and a lazy agent that records the same kind of
verdicts without looking (tool selection 0.0) — and asserts the lazy run
**fails the gate** against the investigator's baseline, including via
`--system-prompt-file`.

**Not done here:** an Anthropic baseline (`--provider anthropic`) needs an
API key this environment doesn't have; the eval runs unchanged with one.
