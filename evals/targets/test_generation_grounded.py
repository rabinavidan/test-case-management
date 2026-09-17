"""EvalTarget for the retrieval-grounded half of the M5 grounded-vs-
ungrounded comparison — see evals/targets/test_generation_ungrounded.py's
docstring for the shared dataset and scoring, and
evals/README.md's "Retrieval-grounded generation" section for the measured
result. Builds the same grounded prompt api/main.py's generate_testcases
endpoint uses when a live call passes grounded=true, feeding each dataset
case's existing_cases in as the "already in this suite" context (see
api/ai_prompts.py's build_grounded_testcase_generation_user_prompt) instead
of a live api/retrieval.py lookup - the whole point of a fixed dataset case
is that its existing_cases are pinned, not queried per run.
"""
from evals.harness import EvalTarget
from evals.targets._retrieval_shared import build_grounded_prompt, score

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
    name="test_generation_grounded",
    metrics=METRICS,
    error_scores=ERROR_SCORES,
    build_prompt=build_grounded_prompt,
    score=score,
)
