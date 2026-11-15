"""Unit tests for evals/triage_scorers.py — pure functions, no model calls."""
from evals.triage_scorers import aggregate_score, keyword_coverage_score, non_empty_score, sentence_count_score, verbatim_echo_rate

GOOD_SUMMARY = (
    "Both failures appear tied to a session timeout during login. The dashboard redirect "
    "never completes, and the session drops on refresh shortly after. Check the auth "
    "service's session expiry configuration first."
)


def test_non_empty_score_true():
    assert non_empty_score(GOOD_SUMMARY) == 1.0


def test_non_empty_score_blank():
    assert non_empty_score("   ") == 0.0


def test_non_empty_score_none():
    assert non_empty_score("") == 0.0


def test_sentence_count_score_within_range():
    assert sentence_count_score(GOOD_SUMMARY) == 1.0


def test_sentence_count_score_single_sentence_fails():
    assert sentence_count_score("It broke.") == 0.0


def test_sentence_count_score_wall_of_text_fails():
    text = ". ".join(["Sentence"] * 10) + "."
    assert sentence_count_score(text) == 0.0


def test_sentence_count_score_empty():
    assert sentence_count_score("") == 0.0


def test_keyword_coverage_score_no_keywords_required():
    assert keyword_coverage_score(GOOD_SUMMARY, []) == 1.0


def test_keyword_coverage_score_full_hit():
    assert keyword_coverage_score(GOOD_SUMMARY, ["timeout", "session", "login"]) == 1.0


def test_keyword_coverage_score_partial_hit():
    assert keyword_coverage_score(GOOD_SUMMARY, ["timeout", "lockout"]) == 0.5


def test_keyword_coverage_score_case_insensitive():
    assert keyword_coverage_score(GOOD_SUMMARY, ["TIMEOUT"]) == 1.0


def test_verbatim_echo_rate_clean_summary():
    assert verbatim_echo_rate(GOOD_SUMMARY) == 0.0


def test_verbatim_echo_rate_one_marker_leaked():
    assert verbatim_echo_rate("- [FAIL] Login with valid credentials\n  Steps: ...") == 0.5


def test_verbatim_echo_rate_both_markers_leaked():
    assert verbatim_echo_rate("[FAIL] a\n[SKIP] b") == 1.0


def test_verbatim_echo_rate_empty():
    assert verbatim_echo_rate("") == 0.0


def test_aggregate_score_shape():
    result = aggregate_score(GOOD_SUMMARY, ["timeout"])
    assert set(result.keys()) == {
        "non_empty_score", "sentence_count_score", "keyword_coverage_score", "verbatim_echo_rate",
    }
    assert result["non_empty_score"] == 1.0
    assert result["verbatim_echo_rate"] == 0.0
