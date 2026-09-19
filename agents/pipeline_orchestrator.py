"""Playwright authoring + healing pipeline as an explicit LangGraph orchestrator.

`docs/agent-governance.md` documents this repo's deliberate choice not to
auto-chain its eight AI agents, and calls out exactly one place where a
real pipeline shape exists: planner -> generator -> healer (the "Playwright
trio"). This module is that orchestrator, built to the shape that doc
already identified, not around it.

It intentionally does NOT replace the real, interactive agents in
`.claude/agents/playwright-test-{planner,generator,healer}.md`, which
explore a live page with real Playwright MCP browser tools inside a Claude
Code session. This is a headless, LLM-only illustration of the same
plan -> generate -> heal shape, useful for demonstrating the orchestration
pattern itself - a LangGraph state machine, human-in-the-loop approval
gates, and a classify/fix/retry planning loop - without requiring a live
browser or an interactive session to run or test.

Two graphs, matching the trio's two natural phases:

1. **Authoring graph** (`build_authoring_graph`): plan -> [human approval] ->
   generate -> [human approval] -> END. Each approval is a real LangGraph
   `interrupt()` - the graph actually pauses and returns control to the
   caller; it does not simulate pausing. This mirrors this repo's existing
   principle (see `e2e/README.md`'s "Playwright Agents" section) that a
   generated spec "needs the same review as a hand-written PR" - the graph
   cannot proceed past either gate without an explicit resume.
2. **Healer graph** (`build_healer_graph`): the classify -> apply-fix ->
   retry loop `.claude/agents/playwright-test-healer.md` describes,
   invoked later when a committed spec starts failing in CI - not chained
   directly after generation, because in the real workflow a spec is
   committed and run many times before any given run fails. Escalates
   immediately on a suspected behavior_change and never retries max_attempts
   times without heal_type behavior_change escalating (same guardrail
   scripts/heal_metrics.py measures compliance with).

Both graphs default to a local Ollama model (no API key, no per-call cost -
see agents/test_plan_reviewer.py for why this repo prefers that for
demonstrable agent code) and accept an injected `llm` for testing with
LangChain's `FakeListChatModel`.
"""
from pathlib import Path
from typing import Callable, Optional, TypedDict

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from agents.test_plan_reviewer import DEFAULT_MODEL, build_ollama_chat_model

DEFAULT_MAX_HEAL_ATTEMPTS = 3
HEAL_OUTCOMES_PATH = Path("heal-outcomes/heal_outcomes.jsonl")
LOCATOR_TIMING_TYPES = {"locator_drift", "timing_drift"}


class PipelineError(RuntimeError):
    """A pipeline step failed to produce parseable output, or the
    underlying model call itself failed (e.g. Ollama unreachable)."""


# ─── Authoring graph: plan -> [approve] -> generate -> [approve] -> END ───────

PLAN_SYSTEM_PROMPT = (
    "You are an expert web test planner. Given a feature description, design 2-4 concrete test "
    "scenarios covering the happy path, one edge case, and error handling. Respond ONLY with a JSON "
    'object, no other text, matching exactly this schema: {{"scenarios": [{{"title": str, '
    '"steps": str, "expected_result": str}}]}}'
)

GENERATE_SYSTEM_PROMPT = (
    "You are an expert Playwright test author. Given a feature description and an approved list of "
    "test scenarios, write a single Playwright TypeScript spec file (using @playwright/test) with one "
    "test per scenario, using accessible role/name locators rather than CSS selectors. Respond ONLY "
    'with a JSON object, no other text, matching exactly this schema: {{"spec_code": str}}'
)


class AuthoringState(TypedDict, total=False):
    feature_description: str
    scenarios: list[dict]
    plan_approved: bool
    spec_code: str
    generation_approved: bool
    outcome: str


def plan_scenarios(feature_description: str, llm: BaseChatModel) -> list[dict]:
    prompt = ChatPromptTemplate.from_messages([
        ("system", PLAN_SYSTEM_PROMPT),
        ("human", "Feature: {feature_description}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    result = chain.invoke({"feature_description": feature_description})
    return result.get("scenarios", []) if isinstance(result, dict) else []


def generate_spec_code(feature_description: str, scenarios: list[dict], llm: BaseChatModel) -> str:
    prompt = ChatPromptTemplate.from_messages([
        ("system", GENERATE_SYSTEM_PROMPT),
        ("human", "Feature: {feature_description}\n\nApproved scenarios:\n{scenarios}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    result = chain.invoke({
        "feature_description": feature_description,
        "scenarios": "\n".join(f"- {s.get('title', '')}: {s.get('steps', '')}" for s in scenarios),
    })
    return result.get("spec_code", "") if isinstance(result, dict) else ""


def build_authoring_graph(llm: Optional[BaseChatModel] = None):
    """Compiles the plan -> [approve] -> generate -> [approve] -> END graph.
    Callers drive it with `.invoke(..., config)` then, after each interrupt,
    `.invoke(Command(resume=...), config)` - see tests/unit/test_pipeline_orchestrator.py
    for the two-turn invocation pattern this requires."""

    def plan_node(state: AuthoringState) -> dict:
        model = llm or build_ollama_chat_model(DEFAULT_MODEL)
        try:
            scenarios = plan_scenarios(state["feature_description"], model)
        except Exception as exc:
            raise PipelineError(f"Planning failed: {exc}") from exc
        return {"scenarios": scenarios}

    def plan_approval_node(state: AuthoringState) -> dict:
        decision = interrupt({"type": "plan_approval", "scenarios": state["scenarios"]})
        return {
            "plan_approved": bool(decision.get("approved")),
            "scenarios": decision.get("scenarios", state["scenarios"]),
        }

    def route_after_plan_approval(state: AuthoringState) -> str:
        return "generate" if state.get("plan_approved") else "rejected"

    def generate_node(state: AuthoringState) -> dict:
        model = llm or build_ollama_chat_model(DEFAULT_MODEL)
        try:
            spec_code = generate_spec_code(state["feature_description"], state["scenarios"], model)
        except Exception as exc:
            raise PipelineError(f"Spec generation failed: {exc}") from exc
        return {"spec_code": spec_code}

    def generation_approval_node(state: AuthoringState) -> dict:
        decision = interrupt({"type": "generation_approval", "spec_code": state["spec_code"]})
        approved = bool(decision.get("approved"))
        return {
            "generation_approved": approved,
            "spec_code": decision.get("spec_code", state["spec_code"]),
            "outcome": "ready_to_commit" if approved else "generation_rejected",
        }

    def route_after_generation_approval(state: AuthoringState) -> str:
        return "done" if state.get("generation_approved") else "rejected"

    def rejected_node(state: AuthoringState) -> dict:
        return {"outcome": state.get("outcome") or "plan_rejected"}

    graph = StateGraph(AuthoringState)
    graph.add_node("plan", plan_node)
    graph.add_node("plan_approval", plan_approval_node)
    graph.add_node("generate", generate_node)
    graph.add_node("generation_approval", generation_approval_node)
    graph.add_node("rejected", rejected_node)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "plan_approval")
    graph.add_conditional_edges("plan_approval", route_after_plan_approval, {"generate": "generate", "rejected": "rejected"})
    graph.add_edge("generate", "generation_approval")
    graph.add_conditional_edges("generation_approval", route_after_generation_approval, {"done": END, "rejected": "rejected"})
    graph.add_edge("rejected", END)
    return graph.compile(checkpointer=MemorySaver())


# ─── Healer graph: run -> classify -> apply_fix|escalate -> retry loop ────────

CLASSIFY_SYSTEM_PROMPT = (
    "You are the Playwright Test Healer. Given a failing test's output, classify it as either "
    '"locator_drift" (a selector is stale, the app still behaves correctly), "timing_drift" (a race '
    'condition, the app still behaves correctly), or "behavior_change" (the app itself looks like it '
    "is doing something different from what the test expects - a suspected real defect). When "
    "genuinely unsure, classify as behavior_change: an unnecessary escalation is far cheaper than a "
    "silently masked defect. Respond ONLY with a JSON object, no other text, matching exactly this "
    'schema: {{"heal_type": "locator_drift"|"timing_drift"|"behavior_change", "reasoning": str}}'
)


class HealerState(TypedDict, total=False):
    spec_file: str
    test_name: str
    attempt: int
    max_attempts: int
    passed: bool
    failure_output: str
    heal_type: str
    reasoning: str
    fix_description: str
    outcome: str


def classify_failure(failure_output: str, llm: BaseChatModel) -> dict:
    prompt = ChatPromptTemplate.from_messages([
        ("system", CLASSIFY_SYSTEM_PROMPT),
        ("human", "Failure output:\n{failure_output}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    result = chain.invoke({"failure_output": failure_output})
    return result if isinstance(result, dict) else {"heal_type": "behavior_change", "reasoning": "unparseable classifier output"}


def _record_heal_outcome(state: HealerState, path: Optional[Path] = None) -> None:
    import json
    from datetime import datetime, timezone

    path = path or HEAL_OUTCOMES_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "spec_file": state.get("spec_file", ""),
        "test_name": state.get("test_name", ""),
        "heal_type": state.get("heal_type", ""),
        "outcome": state.get("outcome", ""),
        "reasoning": state.get("reasoning", ""),
    }
    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")


def build_healer_graph(
    run_playwright_test: Callable[[str, str], dict],
    llm: Optional[BaseChatModel] = None,
    propose_fix: Optional[Callable[[HealerState], str]] = None,
    record_outcome: Callable[[HealerState], None] = _record_heal_outcome,
):
    """Compiles the classify -> apply_fix|escalate -> retry loop. `run_playwright_test(spec_file,
    test_name) -> {"passed": bool, "output": str}` and `propose_fix(state) -> description` are
    injected so this never needs a real browser or a real LLM in tests."""

    def run_node(state: HealerState) -> dict:
        result = run_playwright_test(state["spec_file"], state["test_name"])
        return {"passed": result["passed"], "failure_output": result.get("output", "")}

    def route_after_run(state: HealerState) -> str:
        if state.get("passed"):
            return "record_healed"
        return "classify"

    def classify_node(state: HealerState) -> dict:
        model = llm or build_ollama_chat_model(DEFAULT_MODEL)
        try:
            result = classify_failure(state["failure_output"], model)
        except Exception as exc:
            raise PipelineError(f"Classification failed: {exc}") from exc
        return {"heal_type": result.get("heal_type", "behavior_change"), "reasoning": result.get("reasoning", "")}

    def route_after_classify(state: HealerState) -> str:
        if state.get("heal_type") not in LOCATOR_TIMING_TYPES:
            return "escalate"
        if state.get("attempt", 0) >= state.get("max_attempts", DEFAULT_MAX_HEAL_ATTEMPTS):
            return "mark_skipped"
        return "apply_fix"

    def apply_fix_node(state: HealerState) -> dict:
        fixer = propose_fix or (lambda s: f"auto-fix attempt {s.get('attempt', 0) + 1} for {s.get('heal_type')}")
        return {"fix_description": fixer(state), "attempt": state.get("attempt", 0) + 1}

    def route_after_fix(state: HealerState) -> str:
        return "run"

    def record_healed_node(state: HealerState) -> dict:
        outcome = {**state, "outcome": "healed"}
        record_outcome(outcome)
        return {"outcome": "healed"}

    def escalate_node(state: HealerState) -> dict:
        outcome = {**state, "outcome": "escalated"}
        record_outcome(outcome)
        return {"outcome": "escalated"}

    def mark_skipped_node(state: HealerState) -> dict:
        outcome = {**state, "outcome": "skipped"}
        record_outcome(outcome)
        return {"outcome": "skipped"}

    graph = StateGraph(HealerState)
    graph.add_node("run", run_node)
    graph.add_node("classify", classify_node)
    graph.add_node("apply_fix", apply_fix_node)
    graph.add_node("record_healed", record_healed_node)
    graph.add_node("escalate", escalate_node)
    graph.add_node("mark_skipped", mark_skipped_node)
    graph.add_edge(START, "run")
    graph.add_conditional_edges("run", route_after_run, {"record_healed": "record_healed", "classify": "classify"})
    graph.add_conditional_edges("classify", route_after_classify, {
        "apply_fix": "apply_fix", "escalate": "escalate", "mark_skipped": "mark_skipped",
    })
    graph.add_conditional_edges("apply_fix", route_after_fix, {"run": "run"})
    graph.add_edge("record_healed", END)
    graph.add_edge("escalate", END)
    graph.add_edge("mark_skipped", END)
    return graph.compile()


def heal(
    spec_file: str,
    test_name: str,
    run_playwright_test: Callable[[str, str], dict],
    llm: Optional[BaseChatModel] = None,
    max_attempts: int = DEFAULT_MAX_HEAL_ATTEMPTS,
) -> dict:
    """Convenience wrapper: runs the healer graph to completion and returns its final state."""
    graph = build_healer_graph(run_playwright_test, llm=llm)
    return graph.invoke({
        "spec_file": spec_file, "test_name": test_name, "attempt": 0, "max_attempts": max_attempts,
    })
