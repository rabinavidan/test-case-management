"""Deterministic scoring functions for the AI Failure Triage output — a
free-form text summary, not JSON, so these differ from evals/scorers.py's
schema-based ones but follow the same principle: no model call of its own,
fully reproducible.
"""
import re

# The exact literal markers api/ai_prompts.py's format_triage_problem_line
# puts in the *input* the model is given — if they show up unchanged in its
# *output*, the model pasted the bullet list back instead of following the
# system prompt's "synthesize a diagnosis; do not just repeat the list back."
STATUS_MARKERS = ("[FAIL]", "[SKIP]")


def non_empty_score(summary: str) -> float:
    return 1.0 if summary and summary.strip() else 0.0


def sentence_count_score(summary: str, min_sentences: int = 2, max_sentences: int = 6) -> float:
    """1.0 if the summary's sentence count falls within the range the
    triage prompt asks for (3-5 sentences, with a bit of slack either way),
    else 0.0. A model that returns one run-on sentence or restates every
    input line as its own sentence hasn't followed the prompt, even if
    every word in it is accurate."""
    if not summary or not summary.strip():
        return 0.0
    sentences = [s for s in re.split(r"[.!?]+", summary) if s.strip()]
    return 1.0 if min_sentences <= len(sentences) <= max_sentences else 0.0


def keyword_coverage_score(summary: str, required_keywords: list[str]) -> float:
    """Fraction of the dataset case's required_keywords that appear
    somewhere in the summary — the same cheap proxy evals/scorers.py uses
    for AI Test Generation, applied to plain text instead of structured
    fields."""
    if not required_keywords:
        return 1.0
    haystack = summary.lower()
    hits = sum(1 for kw in required_keywords if kw.lower() in haystack)
    return hits / len(required_keywords)


def verbatim_echo_rate(summary: str) -> float:
    """Fraction of STATUS_MARKERS that appear unchanged in the summary.
    Lower is better — like evals/scorers.py's duplicate_rate, this is a
    "how much did the model fail to do its job" metric, not a "how good"
    one."""
    if not summary:
        return 0.0
    hits = sum(1 for marker in STATUS_MARKERS if marker in summary)
    return hits / len(STATUS_MARKERS)


def aggregate_score(summary: str, required_keywords: list[str]) -> dict:
    return {
        "non_empty_score": non_empty_score(summary),
        "sentence_count_score": sentence_count_score(summary),
        "keyword_coverage_score": keyword_coverage_score(summary, required_keywords),
        "verbatim_echo_rate": verbatim_echo_rate(summary),
    }
