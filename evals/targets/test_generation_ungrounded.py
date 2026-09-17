"""EvalTarget for the plain (no-retrieval) half of the M5 grounded-vs-
ungrounded comparison — see evals/targets/test_generation_grounded.py and
evals/README.md's "Retrieval-grounded generation" section. Runs the same
evals/datasets/test_generation_retrieval.json dataset as the grounded
target, through the same plain prompt api/ai_prompts.py already uses when
a live generate() call isn't grounded, but scores cross_duplicate_rate
against each case's existing_cases so the two targets' reports are directly
comparable.
"""
from api.ai_prompts import TESTCASE_GENERATION_SYSTEM_PROMPT
from evals.harness import EvalTarget
from evals.prompt_versions import prompt_version
from evals.targets._retrieval_shared import build_ungrounded_prompt, score

METRICS = ("schema_score", "count_match_score", "duplicate_rate", "cross_duplicate_rate")
ERROR_SCORES = {"schema_score": 0.0, "count_match_score": 0.0, "duplicate_rate": 1.0, "cross_duplicate_rate": 1.0}

DEFAULT_DATASET = "evals/datasets/test_generation_retrieval.json"

# Informational only, like the base test_generation target's duplicate_rate
# - see that target's comment. cross_duplicate_rate is exactly the number
# this milestone exists to move, not a pass/fail gate.
DEFAULT_MIN_THRESHOLDS = {"schema_score": 0.9, "count_match_score": 0.9}
DEFAULT_MAX_THRESHOLDS: dict = {}
DEFAULT_MAX_ERROR_RATE = 0.2

TARGET = EvalTarget(
    name="test_generation_ungrounded",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=build_ungrounded_prompt,
    score=score,
    # Same prompt identity as the base test_generation target - it really is
    # the same prompt (api/ai_prompts.py's plain, no-retrieval variant).
    prompt_id="test_generation_system",
    prompt_version=prompt_version(TESTCASE_GENERATION_SYSTEM_PROMPT),
)
