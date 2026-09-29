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
from .retrieval import nearest_test_cases

TRIAGE_AGENT_SYSTEM_PROMPT = (
    "You are a senior QA engineer triaging a failed test run. You are given the failed/skipped "
    "results. Before diagnosing, use the tools to investigate where it would change your "
    "conclusion: check a failing case's history to tell a new regression from a flaky test, look "
    "up similar test cases that may share the root cause, and check whether the suite is known to "
    "be flaky. Do not call tools you don't need. Then write a concise plain-English summary "
    "(3-5 sentences) of the likely root cause(s), say whether each failure looks like a real "
    "regression or flakiness based on the evidence you gathered, and suggest what to check first."
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


def build_triage_tools(db: Session, suite_id: int) -> dict:
    """Returns {tool_name: handler} closed over one suite."""

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
            flips = sum(1 for i in range(1, len(history)) if history[i] != history[i - 1])
            if flips >= 2:
                flaky.append({"testcase_id": tc.id, "title": tc.title, "flip_count": flips,
                              "executions": len(history)})
        return {"flaky_tests": flaky}

    return {
        "get_test_case_history": get_test_case_history,
        "get_similar_test_cases": get_similar_test_cases,
        "get_suite_flaky_tests": get_suite_flaky_tests,
    }
