"""Unit tests for evals/harness.py — the OllamaClient is mocked (a stub
with a scripted .generate()), so these never require a real Ollama server."""
import json

import pytest

from evals.harness import CaseReport, RunResult, run_case, run_suite

DATASET_PATH = "evals/datasets/test_generation.json"

VALID_TEST_CASE = {
    "title": "Login with valid credentials",
    "description": "Verify login succeeds",
    "steps": "1. Enter credentials\n2. Submit",
    "expected_result": "User is logged in",
    "priority": "high",
}

# Covers every required_keyword across every case in
# evals/datasets/test_generation.json, so a scripted "good" response scores
# full keyword coverage regardless of which dataset case it's answering for.
ALL_KEYWORDS_TEST_CASE = {
    "title": "Login, reset, and export scenario",
    "description": "login password invalid lockout reset email link expired csv export empty",
    "steps": "1. Do the thing\n2. Check the result",
    "expected_result": "Behaves as expected",
    "priority": "high",
}


class _ScriptedClient:
    """Returns each entry of `responses` in order (looping), or raises it if
    the entry is an Exception instance."""

    def __init__(self, responses):
        self._responses = responses
        self._i = 0

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        response = self._responses[self._i % len(self._responses)]
        self._i += 1
        if isinstance(response, Exception):
            raise response
        return response


def _valid_response(n=2):
    return json.dumps({"test_cases": [VALID_TEST_CASE] * n})


def _all_keywords_response(n=4):
    return json.dumps({"test_cases": [ALL_KEYWORDS_TEST_CASE] * n})


def test_run_case_all_successful_runs():
    case = {"id": "c1", "feature_description": "Login", "count": 2, "required_keywords": ["login"]}
    client = _ScriptedClient([_valid_response(2)])
    report = run_case(case, client, n_runs=3, temperature=0.7)

    assert isinstance(report, CaseReport)
    assert report.case_id == "c1"
    assert len(report.runs) == 3
    assert report.error_rate == 0.0
    assert report.mean_scores["schema_score"] == 1.0
    assert all(r.error is None for r in report.runs)


def test_run_case_records_error_as_failure_not_exclusion():
    case = {"id": "c1", "feature_description": "Login", "count": 2, "required_keywords": []}
    client = _ScriptedClient([RuntimeError("ollama down")])
    report = run_case(case, client, n_runs=2, temperature=0.7)

    assert report.error_rate == 1.0
    assert all(r.error is not None for r in report.runs)
    assert report.mean_scores["schema_score"] == 0.0


def test_run_case_mixed_success_and_failure_consistency():
    case = {"id": "c1", "feature_description": "Login", "count": 1, "required_keywords": []}
    client = _ScriptedClient([_valid_response(1), RuntimeError("flaky")])
    report = run_case(case, client, n_runs=2, temperature=0.7)

    assert report.error_rate == 0.5
    # One run scored 1.0, one scored 0.0 -> mean 0.5, nonzero stdev.
    assert report.mean_scores["schema_score"] == 0.5
    assert report.consistency_stdev["schema_score"] > 0.0


def test_case_report_consistency_needs_two_runs():
    report = CaseReport(case_id="c1", runs=[RunResult(scores={"schema_score": 1.0, "count_match_score": 1.0,
                                                                "keyword_coverage_score": 1.0, "duplicate_rate": 0.0})])
    assert report.consistency_stdev["schema_score"] == 0.0


def test_case_report_empty_runs():
    report = CaseReport(case_id="c1", runs=[])
    assert report.mean_scores["schema_score"] == 0.0
    assert report.error_rate == 0.0


def test_run_suite_builds_one_case_report_per_dataset_case():
    client = _ScriptedClient([_valid_response(4)])
    report = run_suite(DATASET_PATH, client, n_runs=2)

    assert len(report.cases) == 3  # matches evals/datasets/test_generation.json
    ids = {c.case_id for c in report.cases}
    assert ids == {"login-flow", "password-reset", "csv-export"}


def test_suite_report_to_dict_shape():
    client = _ScriptedClient([_valid_response(4)])
    report = run_suite(DATASET_PATH, client, n_runs=2)
    result = report.to_dict()

    assert len(result["cases"]) == 3
    for case in result["cases"]:
        assert case["runs"] == 2
        assert set(case["mean_scores"].keys()) == {
            "schema_score", "count_match_score", "keyword_coverage_score", "duplicate_rate",
        }


@pytest.mark.parametrize("thresholds", [
    {},
    {"schema_score": 0.1, "count_match_score": 0.1, "keyword_coverage_score": 0.1, "max_error_rate": 1.0},
])
def test_overall_pass_true_for_high_quality_runs(thresholds):
    client = _ScriptedClient([_all_keywords_response(4)])
    report = run_suite(DATASET_PATH, client, n_runs=2)
    assert report.overall_pass(thresholds) is True


def test_overall_pass_false_when_a_case_errors_out():
    client = _ScriptedClient([RuntimeError("down")])
    report = run_suite(DATASET_PATH, client, n_runs=2)
    assert report.overall_pass({}) is False
