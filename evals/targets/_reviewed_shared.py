"""Shared prompt-building and scoring for the two human-review targets
(course milestone M9): test_generation_reviewed.py (the production prompt,
which carries reviewers' rejections) and test_generation_reviewed_no_feedback.py
(the same prompt without them — what generation looked like before the
feedback loop). Both run evals/datasets/test_generation_reviewed.json, which
scripts/export_review_dataset.py fills from in-app reviews; running both on
the same model is the before/after check for the feedback loop.
"""
from api.ai_prompts import (
    TESTCASE_GENERATION_SYSTEM_PROMPT,
    build_testcase_generation_user_prompt,
    parse_testcase_generation_response,
)
from evals.scorers import aggregate_score, rejected_repeat_rate

METRICS = ("schema_score", "count_match_score", "duplicate_rate", "rejected_repeat_rate")
ERROR_SCORES = {"schema_score": 0.0, "count_match_score": 0.0, "duplicate_rate": 1.0, "rejected_repeat_rate": 1.0}

DEFAULT_DATASET = "evals/datasets/test_generation_reviewed.json"

DEFAULT_MIN_THRESHOLDS = {"schema_score": 0.9, "count_match_score": 0.9}
# The point of the dataset: a draft a human already rejected must not come
# back. Some tolerance, since a small local model won't be perfect.
DEFAULT_MAX_THRESHOLDS = {"rejected_repeat_rate": 0.2}
DEFAULT_MAX_ERROR_RATE = 0.2


def _prompt(case: dict, with_feedback: bool) -> tuple:
    user_prompt = build_testcase_generation_user_prompt(
        suite_name=case.get("suite_name", "Suite"),
        feature_description=case["feature_description"],
        count=case["count"],
        rejections=case.get("rejected", []) if with_feedback else None,
    )
    return TESTCASE_GENERATION_SYSTEM_PROMPT, user_prompt


def build_prompt_with_feedback(case: dict) -> tuple:
    return _prompt(case, with_feedback=True)


def build_prompt_without_feedback(case: dict) -> tuple:
    return _prompt(case, with_feedback=False)


def score(raw: str, case: dict) -> dict:
    test_cases = parse_testcase_generation_response(raw)
    scores = aggregate_score(test_cases, case["count"], [])
    del scores["keyword_coverage_score"]
    scores["rejected_repeat_rate"] = rejected_repeat_rate(
        test_cases, [r["title"] for r in case.get("rejected", [])],
    )
    return scores
