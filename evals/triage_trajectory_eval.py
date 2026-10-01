"""Trajectory eval for the agentic triage agent (course milestone M10 -
docs/ai-roadmap.md).

The text evals (evals/cli.py) score what the agent *said*. This scores what
it *did*: for each scenario in evals/datasets/triage_trajectories.json it
seeds a throwaway in-memory database (suite, prior runs across environments,
the run to triage, the environment's health), runs the production agent
path - api.triage_agent.run_triage_agent(), the same function the
/triage?agentic=true endpoint calls - and scores the trajectory:

  tool_selection_accuracy - of every (failing case, evidence it must check)
                            pair, the fraction the agent actually checked
                            before finishing ('history' = get_test_case_history
                            for that case or get_suite_flaky_tests;
                            'environment' = get_run_environment_status)
  investigation_rate      - scenarios where it called any evidence tool at all
  verdict_coverage        - failing cases it recorded a verdict for
  verdict_accuracy        - failing cases whose verdict matches the label
  confident_errors        - recorded verdicts that are wrong and not 'unknown'
  cap_hit_rate            - scenarios that ran into the iteration cap
  tool_error_rate         - tool calls that returned an error to the model
  mean_tool_calls         - cost/efficiency of the investigation
  verdict_repeatability   - with --repeats > 1, the fraction of cases given
                            the same verdict on every repeat

--gate compares against a committed baseline
(evals/baselines/<model>/triage_trajectory.json, written by
--record-baseline) with a fixed tolerance, so a prompt change that makes the
agent stop investigating - tool_selection_accuracy falling - fails CI. The
baseline records a hash of the system prompt it was measured with.

Usage:
    python -m evals.triage_trajectory_eval --provider ollama --model qwen2.5:1.5b
    python -m evals.triage_trajectory_eval --provider anthropic --model claude-haiku-4-5-20251001 --repeats 3
    python -m evals.triage_trajectory_eval --provider ollama --model qwen2.5:1.5b --gate
    python -m evals.triage_trajectory_eval ... --system-prompt-file candidate.txt   # score a prompt before shipping it
"""
import argparse
import hashlib
import json
import sys
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api import models, triage_agent
from api.database import Base

DEFAULT_DATASET = Path(__file__).parent / "datasets" / "triage_trajectories.json"
BASELINE_DIR = Path(__file__).parent / "baselines"
TARGET = "triage_trajectory"
EVIDENCE_TOOLS = {"get_test_case_history", "get_similar_test_cases", "get_suite_flaky_tests",
                  "get_run_environment_status"}
GATED_METRICS = ("tool_selection_accuracy", "verdict_coverage", "verdict_accuracy")
TOLERANCE = 0.10
_ENV_TIERS = {"staging": 1, "regression": 2, "preprod": 3, "prod": 4}


def prompt_hash(system_prompt: str) -> str:
    return hashlib.sha256(system_prompt.encode()).hexdigest()[:12]


def seed_scenario(db, scenario: dict) -> tuple[models.TestRun, dict[str, int]]:
    """Builds the scenario's suite and run history. Returns the run to
    triage and {case key: testcase_id}."""
    t0 = datetime(2026, 1, 1)
    envs: dict[str, models.Environment] = {}

    def env(key: str) -> models.Environment:
        if key not in envs:
            envs[key] = models.Environment(key=key, name=key.title(), tier=_ENV_TIERS.get(key, 9),
                                           namespace=f"testflow-{key}", node_name=f"{key}-node-1",
                                           region="eu-west-1")
            db.add(envs[key])
            db.flush()
        return envs[key]

    project = models.Project(name=f"Eval {scenario['id']}")
    db.add(project)
    db.flush()
    suite = models.TestSuite(project_id=project.id, name=scenario["id"])
    db.add(suite)
    db.flush()
    ids = {}
    for case in scenario["cases"]:
        tc = models.TestCase(suite_id=suite.id, title=case["title"], description=case.get("description"),
                             status="active")
        db.add(tc)
        db.flush()
        ids[case["key"]] = tc.id

    # One earlier run per history slot, in order, so every case's history
    # lines up oldest-first with created_at.
    depth = max(len(c["history"]) for c in scenario["cases"])
    for i in range(depth):
        for case in scenario["cases"]:
            if i >= len(case["history"]):
                continue
            env_key, status = case["history"][i]
            run = models.TestRun(suite_id=suite.id, name=f"Earlier {i + 1} ({env_key})",
                                 environment_id=env(env_key).id, created_at=t0 + timedelta(hours=i))
            db.add(run)
            db.flush()
            db.add(models.TestResult(run_id=run.id, testcase_id=ids[case["key"]], status=status))

    target = models.TestRun(suite_id=suite.id, name="Nightly",
                            environment_id=env(scenario["run_environment"]["key"]).id,
                            created_at=t0 + timedelta(hours=depth + 1))
    db.add(target)
    db.flush()
    for case in scenario["cases"]:
        db.add(models.TestResult(run_id=target.id, testcase_id=ids[case["key"]], status=case["current"],
                                 notes=case.get("notes")))
    db.commit()
    return target, ids


@contextmanager
def environment_health(run_env: dict):
    """Pins the synthetic health simulation for one scenario: the run's
    environment reports the scenario's status, every other one is healthy."""
    original = triage_agent.simulate_environment_health

    def fake(key: str) -> dict:
        status = run_env["status"] if key == run_env["key"] else "healthy"
        desired = 2
        ready = {"healthy": desired, "degraded": 1, "down": 0}[status]
        return {"status": status, "pods_ready": ready, "pods_desired": desired,
                "cpu_pct": 35, "mem_pct": 50, "uptime_seconds": 86400}

    triage_agent.simulate_environment_health = fake
    try:
        yield
    finally:
        triage_agent.simulate_environment_health = original


def _checked(requirement: str, testcase_id: int, calls: list) -> bool:
    for c in calls:
        if c.is_error:
            continue
        if requirement == "environment" and c.name == "get_run_environment_status":
            return True
        if requirement == "history":
            if c.name == "get_suite_flaky_tests":
                return True
            if c.name == "get_test_case_history" and str(c.input.get("testcase_id")) == str(testcase_id):
                return True
    return False


def score_trajectory(scenario: dict, ids: dict, loop, agent_verdicts: dict) -> dict:
    calls = loop.tool_calls
    cases = []
    for case in scenario["cases"]:
        if case["current"] != "fail":
            continue
        tid = ids[case["key"]]
        recorded = agent_verdicts.get(tid)
        verdict = recorded["verdict"] if recorded else None
        cases.append({
            "key": case["key"],
            "expected": case["expected_verdict"],
            "verdict": verdict,
            "requirements": {r: _checked(r, tid, calls) for r in case["must_check"]},
        })
    return {
        "scenario": scenario["id"],
        "outcome": loop.call.outcome,
        "error": loop.call.error,
        "tool_sequence": [c.name for c in calls],
        "tool_calls": len(calls),
        "tool_errors": sum(1 for c in calls if c.is_error),
        "investigated": any(c.name in EVIDENCE_TOOLS and not c.is_error for c in calls),
        "hit_iteration_cap": loop.hit_iteration_cap,
        "iterations": loop.iterations,
        "cases": cases,
    }


def aggregate(trajectories: list[dict]) -> dict:
    cases = [c for t in trajectories for c in t["cases"]]
    reqs = [ok for c in cases for ok in c["requirements"].values()]
    calls = sum(t["tool_calls"] for t in trajectories)
    n = len(trajectories) or 1
    by_case: dict[tuple, set] = {}
    for t in trajectories:
        for c in t["cases"]:
            by_case.setdefault((t["scenario"], c["key"]), set()).add(c["verdict"])

    def ratio(num, den):
        return round(num / den, 3) if den else 0.0

    return {
        "trajectories": len(trajectories),
        "failing_cases": len(cases),
        "tool_selection_accuracy": ratio(sum(reqs), len(reqs)),
        "investigation_rate": ratio(sum(t["investigated"] for t in trajectories), n),
        "verdict_coverage": ratio(sum(c["verdict"] is not None for c in cases), len(cases)),
        "verdict_accuracy": ratio(sum(c["verdict"] == c["expected"] for c in cases), len(cases)),
        "confident_errors": sum(1 for c in cases if c["verdict"] not in (None, "unknown", c["expected"])),
        "cap_hit_rate": ratio(sum(t["hit_iteration_cap"] for t in trajectories), n),
        "tool_error_rate": ratio(sum(t["tool_errors"] for t in trajectories), calls),
        "mean_tool_calls": round(calls / n, 2),
        "failed_runs": sum(1 for t in trajectories if t["outcome"] != "success"),
        "verdict_repeatability": ratio(sum(1 for v in by_case.values() if len(v) == 1), len(by_case)),
        "tool_usage": dict(Counter(name for t in trajectories for name in t["tool_sequence"])),
    }


def run_eval(dataset: dict, *, provider: str, model: str, system_prompt: str, repeats: int = 1,
             host: str | None = None, max_iterations: int = 4, only: list[str] | None = None) -> dict:
    trajectories = []
    for scenario in dataset["scenarios"]:
        if only and scenario["id"] not in only:
            continue
        for _ in range(max(1, repeats)):
            engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
            Base.metadata.create_all(engine)
            db = sessionmaker(bind=engine)()
            try:
                run, ids = seed_scenario(db, scenario)
                with environment_health(scenario["run_environment"]):
                    loop, verdicts = triage_agent.run_triage_agent(
                        db, run, triage_agent.collect_problems(db, run), model=model, provider=provider,
                        host=host, system_prompt=system_prompt, max_iterations=max_iterations)
                trajectories.append(score_trajectory(scenario, ids, loop, verdicts))
            finally:
                db.close()
                engine.dispose()
    return {"target": TARGET, "provider": provider, "model": model, "repeats": repeats,
            "prompt_hash": prompt_hash(system_prompt), "metrics": aggregate(trajectories),
            "trajectories": trajectories}


def baseline_path(model: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in model)
    return BASELINE_DIR / safe / f"{TARGET}.json"


def gate(report: dict, baseline: dict | None, tolerance: float = TOLERANCE) -> list[str]:
    """Regressions vs. the baseline; empty list = pass. Without a baseline
    there is nothing to regress from, so only a run that produced no
    trajectory at all fails."""
    metrics = report["metrics"]
    problems = []
    if metrics["failed_runs"] == metrics["trajectories"]:
        problems.append("every agent run failed - see the per-trajectory errors")
    if baseline:
        for name in GATED_METRICS:
            floor = baseline["metrics"][name] - tolerance
            if metrics[name] < floor:
                problems.append(f"{name} {metrics[name]:.3f} < baseline {baseline['metrics'][name]:.3f} "
                                f"- {tolerance}")
    return problems


def _print(report: dict) -> None:
    m = report["metrics"]
    print(f"{report['provider']}:{report['model']} prompt={report['prompt_hash']} "
          f"trajectories={m['trajectories']} failing_cases={m['failing_cases']}")
    for key in ("tool_selection_accuracy", "investigation_rate", "verdict_coverage", "verdict_accuracy",
                "confident_errors", "cap_hit_rate", "tool_error_rate", "mean_tool_calls", "failed_runs",
                "verdict_repeatability"):
        print(f"  {key:<24} {m[key]}")
    for t in report["trajectories"]:
        missing = [f"{c['key']}:{r}" for c in t["cases"] for r, ok in c["requirements"].items() if not ok]
        verdicts = ", ".join(f"{c['key']}={c['verdict']}/{c['expected']}" for c in t["cases"])
        print(f"  - {t['scenario']:<36} tools={' > '.join(t['tool_sequence']) or '(none)'}")
        print(f"    {'':<36} verdicts {verdicts}" + (f"  MISSED {missing}" if missing else "")
              + (f"  ERROR {t['error']}" if t["outcome"] != "success" else ""))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider", choices=["anthropic", "ollama"], default="ollama")
    parser.add_argument("--model", required=True)
    parser.add_argument("--host", default=None, help="Ollama server URL (default: OLLAMA_HOST or localhost).")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--max-iterations", type=int, default=4)
    parser.add_argument("--scenario", action="append", help="Only run this scenario id (repeatable).")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--system-prompt-file", type=Path, default=None,
                        help="Score a candidate system prompt instead of the shipped one.")
    parser.add_argument("--output", type=Path, default=None)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--gate", action="store_true", help="Fail on regression vs. the committed baseline.")
    mode.add_argument("--record-baseline", action="store_true")
    args = parser.parse_args(argv)

    system_prompt = (args.system_prompt_file.read_text() if args.system_prompt_file
                     else triage_agent.TRIAGE_AGENT_SYSTEM_PROMPT)
    report = run_eval(json.loads(args.dataset.read_text()), provider=args.provider, model=args.model,
                      system_prompt=system_prompt, repeats=args.repeats, host=args.host,
                      max_iterations=args.max_iterations, only=args.scenario)
    _print(report)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")

    path = baseline_path(args.model)
    if args.record_baseline:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({k: report[k] for k in ("target", "provider", "model", "repeats",
                                                           "prompt_hash", "metrics")}, indent=2) + "\n")
        print(f"baseline written: {path}")
        return 0
    if args.gate:
        baseline = json.loads(path.read_text()) if path.exists() else None
        if baseline is None:
            print(f"no baseline at {path} - reporting only")
        elif baseline.get("prompt_hash") != report["prompt_hash"]:
            print(f"prompt changed since the baseline ({baseline.get('prompt_hash')} -> "
                  f"{report['prompt_hash']}) - gating the new prompt against the old one's numbers")
        problems = gate(report, baseline)
        for p in problems:
            print(f"  REGRESSION {p}")
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
