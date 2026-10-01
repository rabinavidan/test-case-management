"""Agentic AI Failure Triage (course milestone M7 - see docs/ai-roadmap.md).

The single-shot triage prompt only sees the failing results themselves. This
module gives the model three read-only tools it can *choose* to call before
diagnosing - is this failure new or has it flip-flopped before, which
neighbouring scenarios might share the root cause, is the suite known-flaky -
and api/ai_gateway.complete_with_tools() runs the bounded loop.

Every tool is bound to one suite when built (build_triage_tools). Tool
arguments come from the model and are treated as untrusted input: a
testcase_id outside the run's suite raises, which the gateway reports back to
the model as an is_error tool result rather than leaking another suite's data.
"""
from sqlalchemy.orm import Session

from . import models
from .environment_health import simulate_environment_health
from .retrieval import nearest_test_cases

# Structured triage verdicts (closes the "bug vs flaky vs environment" gap
# in docs/ai-roadmap.md). The model records one per failing case through the
# record_verdict tool - a tool, not free text, so the answer is
# machine-checkable - and every case also gets a deterministic
# heuristic_verdict() from the same evidence. Disagreement between the two,
# or a missing/"unknown" agent verdict, flags the case for human review.
VERDICTS = ("product_bug", "flaky", "environment", "unknown")
UNHEALTHY_ENV_STATUSES = ("degraded", "down")

TRIAGE_AGENT_SYSTEM_PROMPT = (
    "You are a senior QA engineer triaging a failed test run. You are given the failed/skipped "
    "results. Before diagnosing, use the tools to investigate where it would change your "
    "conclusion: check a failing case's history to tell a new regression from a flaky test, look "
    "up similar test cases that may share the root cause, check whether the suite is known to be "
    "flaky, and check the run's environment health and how the same cases did on other "
    "environments. Do not call tools you don't need. Classify every failing case exactly once with "
    "record_verdict: product_bug (a real regression in the product), flaky (passes and fails "
    "without a code change), environment (the environment, not the product, is broken), or "
    "unknown (the evidence does not decide it - never guess). Then write a concise plain-English "
    "summary (3-5 sentences) of the likely root cause(s) and suggest what to check first."
)

TRIAGE_TOOLS = [
    {
        "name": "get_test_case_history",
        "description": "Pass/fail/skip history of one test case across previous runs of this suite, "
                       "oldest first, with executor notes. Use to tell a new regression from a "
                       "flip-flopping (flaky) test.",
        "input_schema": {
            "type": "object",
            "properties": {
                "testcase_id": {"type": "integer", "description": "ID of the test case."},
                "limit": {"type": "integer", "description": "Max runs to return (default 10, max 25)."},
            },
            "required": ["testcase_id"],
        },
    },
    {
        "name": "get_similar_test_cases",
        "description": "Test cases in this suite most similar to a query (embedding retrieval). Use "
                       "to find neighbouring scenarios that may share a root cause.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Free-text description to match."},
                "k": {"type": "integer", "description": "How many to return (default 5, max 10)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_suite_flaky_tests",
        "description": "Test cases in this suite whose pass/fail results have flip-flopped at least "
                       "twice across runs.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_run_environment_status",
        "description": "Health of the environment this run executed on (healthy/degraded/down, pods "
                       "ready), plus each failing case's latest result on the OTHER environments. A "
                       "case failing here but passing elsewhere while this environment is unhealthy "
                       "points to an environment problem, not the product.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "record_verdict",
        "description": "Record your classification of one failing test case. Call once per failing "
                       "case before writing the summary.",
        "input_schema": {
            "type": "object",
            "properties": {
                "testcase_id": {"type": "integer"},
                "verdict": {"type": "string", "enum": list(VERDICTS)},
                "evidence": {"type": "string", "description": "One sentence: the evidence that decided it."},
            },
            "required": ["testcase_id", "verdict", "evidence"],
        },
    },
]


def _pass_fail_history(db: Session, testcase_id: int) -> list[str]:
    return [
        r.status for r in
        db.query(models.TestResult)
          .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
          .filter(models.TestResult.testcase_id == testcase_id, models.TestResult.status.in_(["pass", "fail"]))
          .order_by(models.TestRun.created_at.asc(), models.TestRun.id.asc())
          .all()
    ]


def _flip_count(statuses: list[str]) -> int:
    return sum(1 for i in range(1, len(statuses)) if statuses[i] != statuses[i - 1])


def collect_evidence(db: Session, run: models.TestRun, testcase_id: int) -> dict:
    """The facts both the agent's tools and heuristic_verdict() reason over
    for one failing case in one run."""
    prior = [
        r.status for r in
        db.query(models.TestResult)
          .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
          .filter(models.TestResult.testcase_id == testcase_id,
                  models.TestResult.status.in_(["pass", "fail"]),
                  models.TestRun.id != run.id,
                  models.TestRun.created_at <= run.created_at)
          .order_by(models.TestRun.created_at.asc(), models.TestRun.id.asc())
          .all()
    ]
    environment = None
    if run.environment is not None:
        environment = {"key": run.environment.key,
                       "status": simulate_environment_health(run.environment.key)["status"]}

    other_envs: dict[str, str] = {}
    rows = (
        db.query(models.TestResult, models.TestRun, models.Environment)
          .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
          .join(models.Environment, models.TestRun.environment_id == models.Environment.id)
          .filter(models.TestResult.testcase_id == testcase_id,
                  models.TestResult.status.in_(["pass", "fail"]),
                  models.TestRun.id != run.id)
          .order_by(models.TestRun.created_at.desc(), models.TestRun.id.desc())
          .all()
    )
    for result, _, env in rows:
        if environment and env.key == environment["key"]:
            continue
        other_envs.setdefault(env.key, result.status)  # newest result per environment

    return {
        "testcase_id": testcase_id,
        "prior_statuses": prior,
        "flip_count": _flip_count(prior + ["fail"]),
        "environment": environment,
        "other_environments": [{"environment": k, "status": v} for k, v in sorted(other_envs.items())],
    }


def heuristic_verdict(evidence: dict) -> tuple[str, str]:
    """Deterministic baseline classifier over collect_evidence() output.
    Rules, in priority order:
      1. this environment is unhealthy AND the case passes on another
         environment -> environment
      2. pass/fail has flipped at least twice (including this failure) -> flaky
      3. it passed in its recent previous runs, or it fails on every other
         environment too while this one is healthy -> product_bug
      4. otherwise -> unknown (not enough history to decide)"""
    env = evidence.get("environment")
    others = evidence.get("other_environments") or []
    passes_elsewhere = [o["environment"] for o in others if o["status"] == "pass"]
    if env and env["status"] in UNHEALTHY_ENV_STATUSES and passes_elsewhere:
        return "environment", (f"{env['key']} is {env['status']} and the case passes on "
                               f"{', '.join(passes_elsewhere)}")
    if evidence.get("flip_count", 0) >= 2:
        return "flaky", f"pass/fail flipped {evidence['flip_count']} times across runs"
    prior = evidence.get("prior_statuses") or []
    if prior and all(s == "pass" for s in prior[-2:]):
        return "product_bug", "passed in its previous runs and fails now"
    if others and not passes_elsewhere and (not env or env["status"] == "healthy"):
        return "product_bug", "fails on every other environment too, on a healthy environment"
    return "unknown", "not enough history or cross-environment evidence to decide"


def build_triage_tools(db: Session, suite_id: int, run: models.TestRun | None = None,
                       problem_testcase_ids: list[int] | None = None,
                       verdict_sink: dict | None = None) -> dict:
    """Returns {tool_name: handler} closed over one suite. With a run, also
    exposes get_run_environment_status; with a verdict_sink dict, also
    record_verdict, which stores {testcase_id: {verdict, evidence}} there and
    only accepts IDs of this run's failing cases."""
    problem_ids = set(problem_testcase_ids or [])

    def _require_in_suite(testcase_id: int) -> models.TestCase:
        tc = db.query(models.TestCase).filter(
            models.TestCase.id == int(testcase_id), models.TestCase.suite_id == suite_id,
        ).first()
        if not tc:
            raise ValueError(f"Test case {testcase_id} not found in this run's suite")
        return tc

    def get_test_case_history(testcase_id: int, limit: int = 10) -> dict:
        tc = _require_in_suite(testcase_id)
        limit = max(1, min(int(limit), 25))
        rows = (
            db.query(models.TestResult, models.TestRun)
              .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
              .filter(models.TestResult.testcase_id == tc.id, models.TestResult.status != "pending")
              .order_by(models.TestRun.created_at.desc(), models.TestRun.id.desc())
              .limit(limit)
              .all()
        )
        return {
            "testcase_id": tc.id,
            "title": tc.title,
            "history": [
                {"run": run.name, "status": result.status, "notes": result.notes}
                for result, run in reversed(rows)
            ],
        }

    def get_similar_test_cases(query: str, k: int = 5) -> dict:
        k = max(1, min(int(k), 10))
        return {
            "similar": [
                {"testcase_id": tc.id, "title": tc.title, "description": tc.description}
                for tc in nearest_test_cases(db, suite_id=suite_id, query_text=str(query), k=k)
            ],
        }

    def get_suite_flaky_tests() -> dict:
        flaky = []
        for tc in db.query(models.TestCase).filter(models.TestCase.suite_id == suite_id).all():
            history = _pass_fail_history(db, tc.id)
            flips = _flip_count(history)
            if flips >= 2:
                flaky.append({"testcase_id": tc.id, "title": tc.title, "flip_count": flips,
                              "executions": len(history)})
        return {"flaky_tests": flaky}

    def get_run_environment_status() -> dict:
        if run is None:
            raise ValueError("No run bound to this triage")
        env = run.environment
        return {
            "environment": None if env is None else {"key": env.key, "name": env.name,
                                                    **simulate_environment_health(env.key)},
            "failing_cases": [
                {"testcase_id": tid,
                 "other_environments": collect_evidence(db, run, tid)["other_environments"]}
                for tid in sorted(problem_ids)
            ],
        }

    def record_verdict(testcase_id: int, verdict: str, evidence: str) -> dict:
        if verdict_sink is None:
            raise ValueError("Verdict recording is not enabled for this triage")
        if verdict not in VERDICTS:
            raise ValueError(f"verdict must be one of {', '.join(VERDICTS)}")
        if int(testcase_id) not in problem_ids:
            raise ValueError(f"Test case {testcase_id} is not a failing case in this run")
        verdict_sink[int(testcase_id)] = {"verdict": verdict, "evidence": str(evidence)[:300]}
        return {"recorded": True}

    tools = {
        "get_test_case_history": get_test_case_history,
        "get_similar_test_cases": get_similar_test_cases,
        "get_suite_flaky_tests": get_suite_flaky_tests,
    }
    if run is not None:
        tools["get_run_environment_status"] = get_run_environment_status
    if verdict_sink is not None:
        tools["record_verdict"] = record_verdict
    return tools
