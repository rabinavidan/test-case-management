"""EvalTarget wiring for the AI Failure Triage feature
(POST /api/runs/{id}/triage)."""
from api.ai_prompts import TRIAGE_SYSTEM_PROMPT, build_triage_user_prompt, format_triage_problem_line
from evals.harness import EvalTarget
from evals.triage_scorers import aggregate_score

METRICS = ("non_empty_score", "sentence_count_score", "keyword_coverage_score", "verbatim_echo_rate")
ERROR_SCORES = {
    "non_empty_score": 0.0,
    "sentence_count_score": 0.0,
    "keyword_coverage_score": 0.0,
    "verbatim_echo_rate": 1.0,
}

DEFAULT_DATASET = "evals/datasets/triage.json"

# See evals/targets/test_generation.py for the same reasoning: loose enough
# to check for regressions in the harness/prompt, not "is a tiny CPU model
# a great writer." verbatim_echo_rate is gated at <= 0.5 (at most one of the
# two status markers may leak through) rather than 0.0 — a paraphrase that
# happens to keep "FAIL" as a plain word isn't the failure mode this metric
# targets.
DEFAULT_MIN_THRESHOLDS = {"non_empty_score": 1.0, "sentence_count_score": 0.5, "keyword_coverage_score": 0.5}
DEFAULT_MAX_THRESHOLDS = {"verbatim_echo_rate": 0.5}
DEFAULT_MAX_ERROR_RATE = 0.2


def _build_prompt(case: dict) -> tuple:
    lines = [
        format_triage_problem_line(
            title=p["title"],
            status=p["status"],
            steps=p.get("steps"),
            expected_result=p.get("expected_result"),
            notes=p.get("notes"),
        )
        for p in case["problem_results"]
    ]
    return TRIAGE_SYSTEM_PROMPT, build_triage_user_prompt(case.get("run_name", "Run"), lines)


def _score(raw: str, case: dict) -> dict:
    return aggregate_score(raw.strip(), case.get("required_keywords", []))


TARGET = EvalTarget(
    name="triage",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=_build_prompt,
    score=_score,
)
