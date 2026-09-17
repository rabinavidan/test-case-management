"""Shared dataset/scoring/prompt-building for the two retrieval-comparison
targets (test_generation_ungrounded.py, test_generation_grounded.py) — see
either of those modules' docstrings for what they're for. Not itself a
target module (no TARGET here), just the code both of them need identical
copies of so their reports are comparable case-for-case.
"""
from api.ai_prompts import (
    TESTCASE_GENERATION_GROUNDED_SYSTEM_PROMPT,
    TESTCASE_GENERATION_SYSTEM_PROMPT,
    build_grounded_testcase_generation_user_prompt,
    build_testcase_generation_user_prompt,
    parse_testcase_generation_response,
)
from evals.scorers import aggregate_score, cross_duplicate_rate


def score(raw: str, case: dict) -> dict:
    test_cases = parse_testcase_generation_response(raw)
    existing_titles = [c["title"] for c in case.get("existing_cases", [])]
    scores = aggregate_score(test_cases, case["count"], [])
    scores["cross_duplicate_rate"] = cross_duplicate_rate(test_cases, existing_titles)
    return scores


def build_ungrounded_prompt(case: dict) -> tuple:
    user_prompt = build_testcase_generation_user_prompt(
        suite_name=case.get("suite_name", "Suite"),
        feature_description=case["feature_description"],
        count=case["count"],
    )
    return TESTCASE_GENERATION_SYSTEM_PROMPT, user_prompt


def build_grounded_prompt(case: dict) -> tuple:
    user_prompt = build_grounded_testcase_generation_user_prompt(
        suite_name=case.get("suite_name", "Suite"),
        feature_description=case["feature_description"],
        count=case["count"],
        similar_cases=case.get("existing_cases", []),
    )
    return TESTCASE_GENERATION_GROUNDED_SYSTEM_PROMPT, user_prompt
