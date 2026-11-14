"""Unit tests for agents/pipeline_orchestrator.py's two LangGraph graphs.

FakeListChatModel stands in for a real Ollama model throughout, matching
this repo's existing convention (see tests/unit/test_test_plan_reviewer.py
and tests/unit/test_langgraph_healer_example.py) - none of this requires a
real Ollama server or a real browser. The authoring graph's interrupts are
exercised with the real two-turn invoke -> Command(resume=...) pattern
LangGraph requires, not a mock of it, since that pattern is the actual
human-in-the-loop mechanism being demonstrated.
"""
import json

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.types import Command

from agents.pipeline_orchestrator import DEFAULT_MAX_HEAL_ATTEMPTS, build_authoring_graph, heal


@pytest.fixture(autouse=True)
def _isolate_heal_outcomes_log(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "agents.pipeline_orchestrator.HEAL_OUTCOMES_PATH", tmp_path / "heal_outcomes.jsonl"
    )


def _fake_llm(*responses):
    return FakeListChatModel(responses=list(responses))


SCENARIOS = [{"title": "Valid login", "steps": "1. Enter creds\n2. Submit", "expected_result": "Redirected to dashboard"}]


# --- authoring graph: plan -> [approve] -> generate -> [approve] -> END ------

def test_authoring_graph_approved_end_to_end_produces_spec_code():
    llm = _fake_llm(
        json.dumps({"scenarios": SCENARIOS}),
        json.dumps({"spec_code": "test('valid login', async ({ page }) => { /* ... */ });"}),
    )
    graph = build_authoring_graph(llm=llm)
    config = {"configurable": {"thread_id": "t1"}}

    result = graph.invoke({"feature_description": "Login flow"}, config)
    assert result["__interrupt__"][0].value["type"] == "plan_approval"
    assert result["__interrupt__"][0].value["scenarios"] == SCENARIOS

    result = graph.invoke(Command(resume={"approved": True}), config)
    assert result["__interrupt__"][0].value["type"] == "generation_approval"
    assert "test(" in result["__interrupt__"][0].value["spec_code"]

    final = graph.invoke(Command(resume={"approved": True}), config)
    assert final["outcome"] == "ready_to_commit"
    assert final["generation_approved"] is True


def test_authoring_graph_plan_rejected_stops_before_generation():
    llm = _fake_llm(json.dumps({"scenarios": SCENARIOS}))
    graph = build_authoring_graph(llm=llm)
    config = {"configurable": {"thread_id": "t2"}}

    graph.invoke({"feature_description": "Login flow"}, config)
    final = graph.invoke(Command(resume={"approved": False}), config)

    assert final["outcome"] == "plan_rejected"
    assert "spec_code" not in final


def test_authoring_graph_generation_rejected_does_not_mark_ready():
    llm = _fake_llm(
        json.dumps({"scenarios": SCENARIOS}),
        json.dumps({"spec_code": "test('valid login', async () => {});"}),
    )
    graph = build_authoring_graph(llm=llm)
    config = {"configurable": {"thread_id": "t3"}}

    graph.invoke({"feature_description": "Login flow"}, config)
    graph.invoke(Command(resume={"approved": True}), config)
    final = graph.invoke(Command(resume={"approved": False}), config)

    assert final["outcome"] == "generation_rejected"


def test_authoring_graph_lets_human_revise_scenarios_at_the_approval_gate():
    llm = _fake_llm(
        json.dumps({"scenarios": SCENARIOS}),
        json.dumps({"spec_code": "test('locked out', async () => {});"}),
    )
    graph = build_authoring_graph(llm=llm)
    config = {"configurable": {"thread_id": "t4"}}
    revised = [{"title": "Locked out after 5 attempts", "steps": "...", "expected_result": "..."}]

    graph.invoke({"feature_description": "Login flow"}, config)
    result = graph.invoke(Command(resume={"approved": True, "scenarios": revised}), config)

    assert result["__interrupt__"][0].value["spec_code"] == "test('locked out', async () => {});"


# --- healer graph: run -> classify -> apply_fix|escalate -> retry loop ------

def test_heal_passes_on_first_run_without_calling_the_classifier():
    def run(spec, name):
        return {"passed": True, "output": ""}

    result = heal("specs/login.spec.ts", "valid login", run, llm=_fake_llm())
    assert result["outcome"] == "healed"


def test_heal_locator_drift_healed_after_one_retry():
    run_calls = {"n": 0}

    def run(spec, name):
        run_calls["n"] += 1
        return {"passed": run_calls["n"] > 1, "output": "locator not found: #submit-btn"}

    llm = _fake_llm(json.dumps({"heal_type": "locator_drift", "reasoning": "selector renamed"}))
    result = heal("specs/login.spec.ts", "valid login", run, llm=llm)

    assert result["outcome"] == "healed"
    assert run_calls["n"] == 2


def test_heal_behavior_change_escalates_immediately_without_retrying():
    run_calls = {"n": 0}

    def run(spec, name):
        run_calls["n"] += 1
        return {"passed": False, "output": "expected redirect to /dashboard, got /error"}

    llm = _fake_llm(json.dumps({"heal_type": "behavior_change", "reasoning": "app now errors instead of redirecting"}))
    result = heal("specs/login.spec.ts", "valid login", run, llm=llm)

    assert result["outcome"] == "escalated"
    assert run_calls["n"] == 1  # never retried - escalation is immediate


def test_heal_locator_drift_exhausts_retry_budget_and_is_skipped():
    def run(spec, name):
        return {"passed": False, "output": "still flaky"}

    llm = _fake_llm(*[json.dumps({"heal_type": "locator_drift", "reasoning": "flaky wait"})] * DEFAULT_MAX_HEAL_ATTEMPTS)

    result = heal("specs/login.spec.ts", "valid login", run, llm=llm)

    assert result["outcome"] == "skipped"


def test_heal_writes_a_record_matching_heal_metrics_schema(tmp_path, monkeypatch):
    from agents.pipeline_orchestrator import _record_heal_outcome

    log_path = tmp_path / "heal_outcomes.jsonl"
    state = {
        "spec_file": "specs/login.spec.ts", "test_name": "valid login",
        "heal_type": "locator_drift", "outcome": "healed", "reasoning": "selector renamed",
    }
    _record_heal_outcome(state, path=log_path)

    record = json.loads(log_path.read_text().splitlines()[0])
    for key in ("timestamp", "spec_file", "test_name", "heal_type", "outcome", "reasoning"):
        assert key in record
    assert record["heal_type"] == "locator_drift"
    assert record["outcome"] == "healed"


def test_a_behavior_change_record_is_never_written_as_healed_or_skipped():
    """Guards the one forbidden outcome scripts/heal_metrics.py's
    false_heal_rate exists to catch: a behavior_change heal_type must
    always be recorded as escalated."""
    def run(spec, name):
        return {"passed": False, "output": "real defect"}

    llm = _fake_llm(json.dumps({"heal_type": "behavior_change", "reasoning": "real defect"}))

    result = heal("specs/x.spec.ts", "t", run, llm=llm)

    assert result["heal_type"] == "behavior_change"
    assert result["outcome"] == "escalated"
