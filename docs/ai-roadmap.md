# AI Building-Blocks Roadmap (M7–M10)

The first six course milestones (M1–M6) put LLMs, retrieval, evals, and a
human-approval orchestrator into this repo. This roadmap closes the honest
gaps those milestones left, one building block at a time, so each of
**LLMs · RAG · tool use · evaluations · human-in-the-loop** is backed by
production code *and* a test that proves it — not a README claim.

| # | Milestone | Building block | Gap it closes | Status |
|---|-----------|----------------|---------------|--------|
| M7 | Agentic failure triage (tool use) | Tool use | Product LLM calls were single-shot; tool use only existed in authoring-time Claude Code agents | ✅ Done |
| M8 | Real embeddings behind `get_embedding()` | RAG | Retrieval used a hashed bag-of-words vector, not a learned embedding model | 🟡 Planned |
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

## M8 — Real embeddings behind `get_embedding()` 🟡

**What:** add an `EMBEDDING_PROVIDER` switch (`hash` default · `ollama`
`nomic-embed-text` · a hosted API) behind the existing `get_embedding()`
seam, storing the model name alongside each vector so a provider change
triggers a re-embed instead of silently comparing incompatible vectors.

**Done when:** the eval harness's retrieval-grounded comparison shows a
measurable duplicate-rate reduction for the learned embedding vs. the
hashed baseline on the same dataset — or documents that it doesn't at this
scale, which is also a valid result.

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
