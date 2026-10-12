"""EvalTarget `test_generation_reviewed` (course milestone M9) — see
evals/targets/_reviewed_shared.py. The production generation prompt, carrying the reviewers' rejections for the case (api/main.py adds the same block from a suite's recent rejections). Must keep rejected_repeat_rate under the gate.
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
    build_prompt_with_feedback,
    score,
)

TARGET = EvalTarget(
    name="test_generation_reviewed",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=build_prompt_with_feedback,
    score=score,
    prompt_id="test_generation_system",
    prompt_version=prompt_version(TESTCASE_GENERATION_SYSTEM_PROMPT),
)
