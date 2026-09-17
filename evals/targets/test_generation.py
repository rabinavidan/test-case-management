"""EvalTarget wiring for the AI Test Generation feature
(POST /api/suites/{id}/testcases/generate)."""
from api.ai_prompts import (
    TESTCASE_GENERATION_SYSTEM_PROMPT,
    build_testcase_generation_user_prompt,
    parse_testcase_generation_response,
)
from evals.harness import EvalTarget
from evals.llm_judge import build_judge_prompt_for_test_generation
from evals.scorers import aggregate_score

METRICS = ("schema_score", "count_match_score", "keyword_coverage_score", "duplicate_rate")
ERROR_SCORES = {"schema_score": 0.0, "count_match_score": 0.0, "keyword_coverage_score": 0.0, "duplicate_rate": 1.0}

DEFAULT_DATASET = "evals/datasets/test_generation.json"

# CI regression gate — deliberately looser than "perfect": this checks the
# harness and prompt haven't regressed, not that a small local model is
# flawless. duplicate_rate isn't gated: some repetition across independently
# generated scenarios is expected and not itself a prompt failure.
DEFAULT_MIN_THRESHOLDS = {"schema_score": 0.9, "count_match_score": 0.9, "keyword_coverage_score": 0.5}
DEFAULT_MAX_THRESHOLDS: dict = {}
DEFAULT_MAX_ERROR_RATE = 0.2


def _build_prompt(case: dict) -> tuple:
    user_prompt = build_testcase_generation_user_prompt(
        suite_name=case.get("suite_name", "Suite"),
        feature_description=case["feature_description"],
        count=case["count"],
    )
    return TESTCASE_GENERATION_SYSTEM_PROMPT, user_prompt


def _score(raw: str, case: dict) -> dict:
    test_cases = parse_testcase_generation_response(raw)
    return aggregate_score(test_cases, case["count"], case.get("required_keywords", []))


TARGET = EvalTarget(
    name="test_generation",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=_build_prompt,
    score=_score,
    build_judge_prompt=build_judge_prompt_for_test_generation,
)
