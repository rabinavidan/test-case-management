"""Unit tests for evals/scorers.py — pure functions, no model calls."""
from evals.scorers import aggregate_score, count_match_score, duplicate_rate, keyword_coverage_score, schema_score

VALID_CASE = {
    "title": "Login with valid credentials",
    "description": "Verify login succeeds",
    "steps": "1. Enter credentials\n2. Submit",
    "expected_result": "User is logged in",
    "priority": "high",
}


def test_schema_score_all_valid():
    assert schema_score([VALID_CASE, VALID_CASE]) == 1.0


def test_schema_score_empty_list():
    assert schema_score([]) == 0.0


def test_schema_score_missing_field():
    bad = {k: v for k, v in VALID_CASE.items() if k != "expected_result"}
    assert schema_score([VALID_CASE, bad]) == 0.5


def test_schema_score_blank_field():
    bad = {**VALID_CASE, "title": "   "}
    assert schema_score([bad]) == 0.0


def test_schema_score_invalid_priority():
    bad = {**VALID_CASE, "priority": "urgent"}
    assert schema_score([bad]) == 0.0


def test_schema_score_ignores_non_dict_entries():
    assert schema_score(["not a dict"]) == 0.0


def test_count_match_score_exact():
    assert count_match_score([VALID_CASE, VALID_CASE], 2) == 1.0


def test_count_match_score_under():
    assert count_match_score([VALID_CASE], 4) == 0.25


def test_count_match_score_over_caps_at_one():
    assert count_match_score([VALID_CASE] * 5, 2) == 1.0


def test_count_match_score_zero_expected_and_empty():
    assert count_match_score([], 0) == 1.0


def test_count_match_score_zero_expected_but_nonempty():
    assert count_match_score([VALID_CASE], 0) == 0.0


def test_keyword_coverage_score_no_keywords_required():
    assert keyword_coverage_score([VALID_CASE], []) == 1.0


def test_keyword_coverage_score_full_hit():
    assert keyword_coverage_score([VALID_CASE], ["login", "credentials"]) == 1.0


def test_keyword_coverage_score_partial_hit():
    assert keyword_coverage_score([VALID_CASE], ["login", "lockout"]) == 0.5


def test_keyword_coverage_score_case_insensitive():
    assert keyword_coverage_score([VALID_CASE], ["LOGIN"]) == 1.0


def test_duplicate_rate_no_duplicates():
    other = {**VALID_CASE, "title": "Login with invalid password"}
    assert duplicate_rate([VALID_CASE, other]) == 0.0


def test_duplicate_rate_with_duplicates():
    dup = {**VALID_CASE, "title": "  Login WITH valid credentials  "}
    assert duplicate_rate([VALID_CASE, dup]) == 0.5


def test_duplicate_rate_empty_list():
    assert duplicate_rate([]) == 0.0


def test_aggregate_score_shape():
    result = aggregate_score([VALID_CASE], 1, ["login"])
    assert set(result.keys()) == {"schema_score", "count_match_score", "keyword_coverage_score", "duplicate_rate"}
    assert result["schema_score"] == 1.0
    assert result["count_match_score"] == 1.0
    assert result["keyword_coverage_score"] == 1.0
    assert result["duplicate_rate"] == 0.0
