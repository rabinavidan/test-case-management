"""Deterministic scoring functions for the AI Test Generation output.

No LLM-as-judge here on purpose: every scorer below is a plain, reproducible
check with no model call of its own, so a harness run's score is itself
deterministic even though the thing it's scoring isn't. (An LLM-as-judge
scorer is a reasonable extension — see evals/README.md's Future work.)
"""
from api.embeddings import cosine_similarity, get_embedding

REQUIRED_FIELDS = ("title", "description", "steps", "expected_result", "priority")
VALID_PRIORITIES = {"low", "medium", "high", "critical"}


def schema_score(test_cases: list[dict]) -> float:
    """Fraction of test cases with every required field present, non-empty,
    and a valid priority value. 0.0 for an empty list — an empty response
    is a failure, not a vacuous pass."""
    if not test_cases:
        return 0.0
    ok = 0
    for tc in test_cases:
        if not isinstance(tc, dict):
            continue
        if not all(field in tc for field in REQUIRED_FIELDS):
            continue
        if any(not str(tc[field]).strip() for field in REQUIRED_FIELDS):
            continue
        if tc["priority"] not in VALID_PRIORITIES:
            continue
        ok += 1
    return ok / len(test_cases)


def count_match_score(test_cases: list[dict], expected_count: int) -> float:
    """How close the number of generated test cases is to what was asked
    for, capped at 1.0 (more than asked for doesn't score above a perfect
    match)."""
    if expected_count <= 0:
        return 1.0 if not test_cases else 0.0
    return min(len(test_cases), expected_count) / expected_count


def keyword_coverage_score(test_cases: list[dict], required_keywords: list[str]) -> float:
    """Fraction of the dataset case's required_keywords that appear
    somewhere in the generated test cases' text — a cheap proxy for "did
    the model actually address the scenarios the feature description
    called for" without needing an LLM judge."""
    if not required_keywords:
        return 1.0
    haystack = " ".join(
        " ".join(str(tc.get(f, "")) for f in REQUIRED_FIELDS)
        for tc in test_cases
        if isinstance(tc, dict)
    ).lower()
    hits = sum(1 for kw in required_keywords if kw.lower() in haystack)
    return hits / len(required_keywords)


def duplicate_rate(test_cases: list[dict]) -> float:
    """Fraction of test cases whose title duplicates an earlier one in the
    same run (case-insensitive, whitespace-normalized) — a cheap proxy for
    a model repeating itself instead of covering distinct scenarios. 0.0
    for an empty list (no duplicates possible, not "fully duplicated")."""
    if not test_cases:
        return 0.0
    seen = set()
    dup = 0
    for tc in test_cases:
        key = " ".join(str(tc.get("title", "") if isinstance(tc, dict) else "").lower().split())
        if key in seen:
            dup += 1
        else:
            seen.add(key)
    return dup / len(test_cases)


CROSS_DUPLICATE_SIMILARITY_THRESHOLD = 0.6


def cross_duplicate_rate(test_cases: list[dict], existing_titles: list[str]) -> float:
    """Fraction of generated test cases whose title is a near-duplicate —
    embedding cosine similarity at or above CROSS_DUPLICATE_SIMILARITY_THRESHOLD
    — of one of existing_titles. This is the metric evals/README.md's
    "Retrieval-grounded generation" section uses to measure whether grounding
    a generation call against a suite's existing cases (see api/retrieval.py)
    actually reduces how often the model re-covers a scenario that's already
    there. Reuses api/embeddings.py — the same distance production's
    retrieval path uses to decide what counts as "already covered" — rather
    than duplicate_rate's plain exact-match, since a near-duplicate title
    ("Login succeeds with valid credentials" vs. "Login with valid
    credentials succeeds") is exactly the case dedup needs to catch. 0.0 when
    there's nothing to compare against (no existing_titles) or nothing was
    generated — not "fully duplicated"."""
    if not test_cases or not existing_titles:
        return 0.0
    existing_embeddings = [get_embedding(t) for t in existing_titles]
    dup = 0
    for tc in test_cases:
        title = str(tc.get("title", "") if isinstance(tc, dict) else "")
        if not title.strip():
            continue
        embedding = get_embedding(title)
        if any(cosine_similarity(embedding, e) >= CROSS_DUPLICATE_SIMILARITY_THRESHOLD for e in existing_embeddings):
            dup += 1
    return dup / len(test_cases)


def aggregate_score(test_cases: list[dict], expected_count: int, required_keywords: list[str]) -> dict:
    return {
        "schema_score": schema_score(test_cases),
        "count_match_score": count_match_score(test_cases, expected_count),
        "keyword_coverage_score": keyword_coverage_score(test_cases, required_keywords),
        "duplicate_rate": duplicate_rate(test_cases),
    }
