# agents/ — LangChain and LangGraph agents

Two independent agents live here:

1. **[Test Plan Reviewer](#test-plan-reviewer--a-langchain-agent)** (below) — a two-step LangChain
   critic/drafter pipeline for test-coverage gaps.
2. **[Pipeline Orchestrator](#pipeline-orchestrator--a-langgraph-multi-agent-graph)** — a LangGraph
   orchestrator for the Playwright planner/generator/healer trio, with real human-in-the-loop
   approval gates.

## Test Plan Reviewer — a LangChain agent

A small two-step agentic pipeline, built with [LangChain](https://python.langchain.com/)
instead of the hand-rolled HTTP-client style this repo's other agents use
(`scripts/coverage_gap_agent.py`, `evals/ollama_client.py`):

1. **critic** — given a feature description and its existing test cases,
   lists concrete scenarios they don't cover.
2. **drafter** — given those gaps, drafts one test case per gap, in the
   same schema AI Test Generation uses (`api/ai_prompts.py`), so the
   output can be saved through the existing
   `POST /api/suites/{id}/testcases/generate/save` endpoint unchanged.

### Why LangChain here and not everywhere

This repo's other agents (PR Steward, Coverage-Gap Agent, AI Test
Generation/Triage) are all single-shot LLM calls against a plain HTTP
client — no framework needed for "send one prompt, parse one response."
This agent is different: it's a genuine two-step pipeline where the second
step's input depends on the first step's output, each with its own role
and prompt. That's the shape LangChain's `prompt | llm | parser`
(LangChain Expression Language, LCEL) is built for — composable chains
with pluggable models and output parsers — so this milestone deliberately
uses it there, rather than hand-rolling a second HTTP client.

### Why the critic/drafter split is a real pipeline, not a relabeled call

The drafter's prompt only exists because of the critic's output — you
can't draft a test case for "the gaps" without first knowing what they
are. `draft_test_cases_for_gaps` also short-circuits (returns `[]` without
calling the model at all) when there are nothing to draft for, which a
single combined "generate more test cases" prompt couldn't express as
cleanly.

### A real model, a real failure, and how the code handles it

Built and validated against a real local model (`qwen2.5:0.5b` via
[Ollama](https://ollama.com)), not just mocks. The first attempt used
temperature 0.7 (evals/'s default) and the model returned plain prose
instead of JSON despite the system prompt asking for JSON only — LangChain
raised `OutputParserException`. Two changes fixed it in practice: a lower
temperature (`0.2` — structured-output tasks are more reliable at lower
temperature) and a stronger instruction ("Respond ONLY with a JSON object,
no other text"). Even so, a 0.5B model can still fail to format correctly
on a given run — the code doesn't assume it won't: `review_and_fill_gaps`
catches any exception from either step and re-raises it as
`PlanReviewError`, the same "degrade with a clear error instead of
crashing" contract this repo's other AI integrations follow (see the root
README's AI Engineering section).

### A real dependency conflict, and how it was resolved

Adding `langchain-core`/`langchain-ollama` to `requirements-test.txt`
surfaced two real pin conflicts with this repo's existing dependencies,
not hypothetical ones:

- `langchain-ollama`'s own `ollama` client dependency requires
  `httpx>=0.27`, but `requirements-test.txt` pinned `httpx==0.25.2`.
  Bumping straight to the latest (0.28+) broke `starlette`'s `TestClient`
  (used throughout `tests/api`/`tests/contract`) — httpx 0.28 removed the
  `Client(app=...)` shortcut it relies on. Pinned `httpx==0.27.2` instead:
  the newest release that still supports it.
- `langchain-core==1.6.3` requires `pydantic>=2.7.4`, but the app itself
  pins `pydantic==2.5.0` in `requirements.txt`. Since both files install
  into the same environment, whichever is looser loses — bumped
  `requirements.txt`'s pin to `pydantic==2.13.5` (the version pip actually
  resolved) rather than pinning an old `langchain-core` to dodge the
  conflict, and reran the full `pytest tests/unit tests/api tests/contract
  tests/services` suite against it before committing to the bump. All 543
  tests passed unchanged — pydantic v2 minor releases are additive for the
  plain `BaseModel` usage in `api/schemas.py`, not breaking.

### Usage

Requires a local Ollama server with the target model pulled:

```bash
ollama pull qwen2.5:0.5b
python -m agents.cli --feature "User login with username and password, including lockout after repeated failures"
```

Review against an existing set of test cases (a JSON file — a list of
dicts with at least `title`/`description`, e.g. what
`GET /api/suites/{id}/testcases` returns):

```bash
python -m agents.cli --feature "Login flow" --existing existing_cases.json --model qwen2.5:0.5b
```

### Layout

| File | Purpose |
|------|---------|
| `agents/test_plan_reviewer.py` | The critic/drafter LangChain pipeline (`find_coverage_gaps`, `draft_test_cases_for_gaps`, `review_and_fill_gaps`). |
| `agents/cli.py` | `python -m agents.cli` entrypoint. |

Unit tests (`tests/unit/test_test_plan_reviewer.py`,
`tests/unit/test_agents_cli.py`) use LangChain's own `FakeListChatModel` to
script both the critic and drafter responses — no real Ollama server
required, matching how this repo's other AI-feature tests never hit a real
Anthropic/Gemini API either. The `OutputParserException`-on-malformed-output
path is exercised directly, not just the happy path, since it's a real
failure mode observed while building this, not a hypothetical one.

### Future work

- Wire this into the eval harness (`evals/`) as a third target — the
  critic/drafter split doesn't map cleanly onto the single-prompt
  `EvalTarget` shape as-is, so this needs its own multi-step scoring, not
  just a reused metric set.
- Expose this as an API endpoint (`POST /api/suites/{id}/testcases/review`)
  the way AI Test Generation and AI Failure Triage are, rather than
  CLI-only.

## Pipeline Orchestrator — a LangGraph multi-agent graph

An explicit [LangGraph](https://langchain-ai.github.io/langgraph/) orchestrator for the Playwright
planner → generator → healer trio — see
[`docs/agent-governance.md`](../docs/agent-governance.md#a-langgraph-orchestrator-for-the-trio-built-to-the-checkpoints-above)
for why this exists and what it deliberately doesn't replace.

Two graphs:

1. **Authoring graph** (`build_authoring_graph`) — `plan → [approve] → generate → [approve] → END`.
   Both approvals are real LangGraph `interrupt()` calls: the graph execution pauses and returns
   control to the caller, who resumes it with `Command(resume=...)`. Nothing reaches
   `outcome: "ready_to_commit"` without both gates firing.
2. **Healer graph** (`build_healer_graph` / the `heal()` convenience wrapper) — `run → classify →
   apply_fix|escalate`, looping back to `run` after a fix, up to `max_attempts`. A `behavior_change`
   classification escalates immediately, never retries — the same guardrail
   `.claude/agents/playwright-test-healer.md` and `scripts/heal_metrics.py`'s `false_heal_rate` already
   enforce/measure for the real, interactive healer.

### Why LangGraph specifically

LangChain's LCEL chains (used by the Test Plan Reviewer above) compose linearly — `prompt | llm |
parser`. This orchestrator needs two things LCEL doesn't model: **branching** (classify's output
picks one of three next steps, not a fixed next link) and **a pause that isn't a function return** (an
approval gate has to suspend mid-graph and resume later with new input, not just receive an argument
up front). LangGraph's `StateGraph` (conditional edges) and `interrupt()`/`Command(resume=...)` are
built for exactly those two things, which is why this milestone reaches for it instead of another LCEL
chain.

### Usage

Both graphs default to a local Ollama model (no API key, no per-call cost — same reasoning as the Test
Plan Reviewer above). The authoring graph needs a `thread_id` (LangGraph's checkpointer keys state by
it) and a two-turn invoke pattern:

```python
from langgraph.types import Command
from agents.pipeline_orchestrator import build_authoring_graph

graph = build_authoring_graph()
config = {"configurable": {"thread_id": "demo-1"}}

result = graph.invoke({"feature_description": "User login with lockout after repeated failures"}, config)
print(result["__interrupt__"][0].value)  # {"type": "plan_approval", "scenarios": [...]}

result = graph.invoke(Command(resume={"approved": True}), config)
print(result["__interrupt__"][0].value)  # {"type": "generation_approval", "spec_code": "..."}

final = graph.invoke(Command(resume={"approved": True}), config)
print(final["outcome"])  # "ready_to_commit"
```

```python
from agents.pipeline_orchestrator import heal

result = heal(
    "specs/login.spec.ts", "valid login",
    run_playwright_test=lambda spec, name: {"passed": False, "output": "locator not found: #submit-btn"},
)
print(result["outcome"])  # "healed", "escalated", or "skipped"
```

### Layout

| File | Purpose |
|------|---------|
| `agents/pipeline_orchestrator.py` | Both graphs (`build_authoring_graph`, `build_healer_graph`, `heal`). |

Unit tests (`tests/unit/test_pipeline_orchestrator.py`) use `FakeListChatModel` for every LLM call and
an injected `run_playwright_test` callable for the healer graph — no real Ollama server or real browser
required. The authoring graph's tests drive the real `invoke` → `Command(resume=...)` two-turn pattern
rather than mocking it, since that pattern *is* the human-in-the-loop mechanism being demonstrated.

### Future work

- Wire the authoring graph's approval gates into an actual UI/CLI prompt (today a caller supplies the
  resume value programmatically, e.g. from a test or a script) rather than the two-turn `invoke` pattern
  being the only interface.
- The healer graph's `apply_fix` node takes an injected `propose_fix` callable; a real implementation
  (an LLM call proposing an actual code edit, not just a description) is future work — this milestone's
  scope was the orchestration shape, not a second implementation of the interactive healer's fix logic.
