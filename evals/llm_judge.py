"""An optional LLM-as-judge scorer — rates semantic quality on a fixed
rubric that a deterministic check can't reach (e.g. "is this test case
actually testable as written", "does this triage summary point at a
plausible root cause"). Deliberately separate from evals/scorers.py's and
evals/triage_scorers.py's deterministic scores, not a replacement for them
(see evals/README.md's original design note: "No LLM-as-judge here on
purpose... a scorer that itself calls a model would add its own
non-determinism on top of the thing being measured"). This module is that
next step, kept explicitly optional and reported on its own axis rather
than folded into the deterministic metrics it can't be compared against
apples-to-apples.

Off by default: evals/harness.py only calls this when a judge client is
explicitly configured (see evals/cli.py's --judge-model). No judge model
configured, or an individual judge call failing, both degrade to "no judge
score for this run" rather than crashing the eval — the same graceful-skip
convention the rest of this repo's AI-feature code uses for a missing API
key.
"""
import json

JUDGE_RUBRIC_TEST_GENERATION = (
    "You are an expert QA lead judging AI-generated test cases for quality, "
    "not schema correctness (that is already checked separately by other "
    "means). Rate the test cases below on a single scale from 0.0 (useless) "
    "to 1.0 (excellent), considering:\n"
    "- Is each test case's scenario specific and testable as written, not vague?\n"
    "- Do the steps and expected result plausibly match the feature description?\n"
    "- Do the test cases cover genuinely distinct scenarios, not near-duplicates?\n"
    "Respond with a JSON object matching exactly this schema: "
    '{"score": <float between 0.0 and 1.0>, "reasoning": <short string>}'
)

JUDGE_RUBRIC_TRIAGE = (
    "You are an expert QA lead judging an AI-written failure-triage summary "
    "for quality, not just its shape (that is already checked separately by "
    "other means). Rate the summary below on a single scale from 0.0 "
    "(useless) to 1.0 (excellent), considering:\n"
    "- Does it identify a plausible root cause tying the failures together, "
    "rather than just restating each failure individually?\n"
    "- Is it actionable — does it suggest what to check first?\n"
    "- Is it a synthesis, not a copy of the input list?\n"
    "Respond with a JSON object matching exactly this schema: "
    '{"score": <float between 0.0 and 1.0>, "reasoning": <short string>}'
)


def build_judge_prompt_for_test_generation(case: dict, raw_response: str) -> tuple:
    user_prompt = (
        f"Feature description: {case.get('feature_description', '')}\n\n"
        f"Generated test cases (raw model output):\n{raw_response}"
    )
    return JUDGE_RUBRIC_TEST_GENERATION, user_prompt


def build_judge_prompt_for_triage(case: dict, raw_response: str) -> tuple:
    user_prompt = f"Run: {case.get('run_name', 'Run')}\n\nTriage summary (raw model output):\n{raw_response}"
    return JUDGE_RUBRIC_TRIAGE, user_prompt


def parse_judge_score(raw: str) -> float:
    """Parses the judge's {"score": ..., "reasoning": ...} response and
    clamps the score into [0.0, 1.0] — a judge model can and does return a
    score outside that range, or as a string, neither of which should crash
    the harness. Raises (same as evals/scorers.py's response parsing) if the
    response isn't valid JSON at all or has no "score" field — that's a
    real judge-call failure, not a score to silently coerce to 0.0."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    parsed = json.loads(text)
    score = float(parsed["score"])
    return max(0.0, min(1.0, score))
