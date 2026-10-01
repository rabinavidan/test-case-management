"""Unit tests for evals/triage_trajectory_eval.py (course milestone M10).

Two scripted agents play the model through the real tool loop
(api.triage_agent.run_triage_agent -> complete_with_tools) with a fake
Anthropic client: an investigator that checks evidence before recording
verdicts, and a lazy agent that records the same verdicts without looking.
The eval must tell them apart - that is the "CI flags a prompt change that
makes the agent stop investigating" guarantee - with no API key or model."""
import json
import re

import anthropic
import pytest

from api import triage_agent
from evals import triage_trajectory_eval as traj

DATASET = json.loads(traj.DEFAULT_DATASET.read_text())
LABELS = {c["title"]: c.get("expected_verdict") for s in DATASET["scenarios"] for c in s["cases"]}


class _Block:
    def __init__(self, type, **kw):
        self.type = type
        self.__dict__.update(kw)


class _Msg:
    def __init__(self, blocks):
        self.content = blocks
        self.usage = None


def _failing(prompt: str) -> list[tuple[int, str]]:
    return [(int(i), t) for i, t in re.findall(r"\(testcase_id=(\d+)\) \[FAIL\] (.+)", prompt)]


def _uses(calls):
    return _Msg([_Block("tool_use", id=f"tu_{n}", name=name, input=inp) for n, (name, inp) in enumerate(calls)])


def investigator(messages):
    failing = _failing(messages[0]["content"])
    turn = len(messages)
    if turn == 1:
        return _uses([("get_run_environment_status", {})]
                     + [("get_test_case_history", {"testcase_id": i}) for i, _ in failing])
    if turn == 3:
        return _uses([("record_verdict", {"testcase_id": i, "verdict": LABELS[t], "evidence": "checked"})
                      for i, t in failing])
    return _Msg([_Block("text", text="Summary.")])


def lazy(messages):
    failing = _failing(messages[0]["content"])
    if len(messages) == 1:
        return _uses([("record_verdict", {"testcase_id": i, "verdict": "product_bug", "evidence": "looks broken"})
                      for i, _ in failing])
    return _Msg([_Block("text", text="Summary.")])


@pytest.fixture()
def agent(monkeypatch):
    def install(policy):
        class _Messages:
            def create(self, **kwargs):
                return policy(kwargs["messages"])

        class _Fake:
            def __init__(self, api_key=None):
                self.messages = _Messages()

        monkeypatch.setattr(anthropic, "Anthropic", _Fake)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "fake")
    return install


def _run(**kw):
    return traj.run_eval(DATASET, provider="anthropic", model="fake",
                         system_prompt=triage_agent.TRIAGE_AGENT_SYSTEM_PROMPT, **kw)


def test_investigating_agent_scores_full_marks(agent):
    agent(investigator)
    m = _run(repeats=2)["metrics"]
    assert m["trajectories"] == 2 * len(DATASET["scenarios"])
    assert m["tool_selection_accuracy"] == 1.0
    assert m["investigation_rate"] == 1.0
    assert (m["verdict_coverage"], m["verdict_accuracy"], m["confident_errors"]) == (1.0, 1.0, 0)
    assert m["verdict_repeatability"] == 1.0 and m["cap_hit_rate"] == 0.0 and m["failed_runs"] == 0


def test_lazy_agent_is_caught_and_fails_the_gate_against_an_investigating_baseline(agent):
    agent(investigator)
    baseline = _run()
    agent(lazy)
    report = _run()
    m = report["metrics"]
    assert m["tool_selection_accuracy"] == 0.0 and m["investigation_rate"] == 0.0
    assert m["verdict_coverage"] == 1.0  # it did answer - just without looking
    assert m["confident_errors"] > 0
    problems = traj.gate(report, baseline)
    assert any(p.startswith("tool_selection_accuracy") for p in problems)
    assert traj.gate(baseline, baseline) == []


def test_skipped_results_are_not_scored_as_failing_cases(agent):
    agent(investigator)
    t = _run(only=["skip-is-not-a-failure"])["trajectories"][0]
    assert [c["key"] for c in t["cases"]] == ["profile"]


def test_scenario_seeding_matches_the_labels_through_the_heuristic():
    """The seeded databases carry the evidence the labels claim: the
    deterministic baseline over collect_evidence() reproduces every label."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from api.database import Base

    for scenario in DATASET["scenarios"]:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()
        run, ids = traj.seed_scenario(db, scenario)
        with traj.environment_health(scenario["run_environment"]):
            for case in scenario["cases"]:
                if case["current"] == "fail":
                    verdict, _ = triage_agent.heuristic_verdict(triage_agent.collect_evidence(db, run, ids[case["key"]]))
                    assert verdict == case["expected_verdict"], (scenario["id"], case["key"])
        db.close()


def test_failed_runs_alone_fail_the_gate_without_a_baseline():
    report = {"metrics": {"failed_runs": 3, "trajectories": 3}}
    assert traj.gate(report, None)
    assert traj.gate({"metrics": {"failed_runs": 0, "trajectories": 3}}, None) == []


def test_cli_records_then_gates_against_the_baseline(agent, monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(traj, "BASELINE_DIR", tmp_path)
    agent(investigator)
    args = ["--provider", "anthropic", "--model", "fake:model", "--scenario", "flaky-checkout"]
    assert traj.main(args + ["--record-baseline"]) == 0
    saved = json.loads((tmp_path / "fake_model" / "triage_trajectory.json").read_text())
    assert saved["metrics"]["tool_selection_accuracy"] == 1.0
    assert saved["prompt_hash"] == traj.prompt_hash(triage_agent.TRIAGE_AGENT_SYSTEM_PROMPT)
    assert traj.main(args + ["--gate", "--output", str(tmp_path / "r.json")]) == 0

    prompt = tmp_path / "candidate.txt"
    prompt.write_text("Just answer.")
    agent(lazy)
    assert traj.main(args + ["--gate", "--system-prompt-file", str(prompt)]) == 1
    out = capsys.readouterr().out
    assert "prompt changed since the baseline" in out and "REGRESSION tool_selection_accuracy" in out
