"""EvalTarget `test_generation_reviewed_no_feedback` (course milestone M9) — see
evals/targets/_reviewed_shared.py. The same prompt without the reviewers' rejections — generation as it was before the M9 feedback loop. Informational: compare its rejected_repeat_rate with test_generation_reviewed's on the same model.
"""
from api.ai_prompts import TESTCASE_GENERATION_SYSTEM_PROMPT
from evals.harness import EvalTarget
from evals.prompt_versions import prompt_version
from evals.targets._reviewed_shared import (  # noqa: F401  (re-exported for evals/cli.py)
    DEFAULT_DATASET,
    DEFAULT_MAX_ERROR_RATE,
    DEFAULT_MAX_THRESHOLDS,
    DEFAULT_MIN_THRESHOLDS,
    ERROR_SCORES,
    METRICS,
    build_prompt_without_feedback,
    score,
)

TARGET = EvalTarget(
    name="test_generation_reviewed_no_feedback",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=build_prompt_without_feedback,
    score=score,
    prompt_id="test_generation_system",
    prompt_version=prompt_version(TESTCASE_GENERATION_SYSTEM_PROMPT),
)
