"""Unit tests for evals/harness.py's generic orchestration — a synthetic
EvalTarget stands in for a real feature, so these tests aren't coupled to
test_generation's or triage's specific prompts/scorers (see
tests/unit/test_evals_targets_*.py for those). The OllamaClient is a
scripted stub, so none of this requires a real Ollama server.
"""
import pytest

from evals.harness import CaseReport, EvalTarget, RunResult, run_case, run_suite

METRICS = ("goodness",)
ERROR_SCORES = {"goodness": 0.0}


def _build_prompt(case: dict) -> tuple:
    return "system", f"describe {case['id']}"


def _score(raw: str, case: dict) -> dict:
    if raw == "bad":
        raise ValueError("model returned garbage")
    return {"goodness": 1.0 if raw == "good" else 0.5}


TOY_TARGET = EvalTarget(name="toy", metrics=METRICS, error_scores=ERROR_SCORES, build_prompt=_build_prompt, score=_score)


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


def test_run_case_all_successful_runs():
    case = {"id": "c1"}
    client = _ScriptedClient(["good"])
    report = run_case(case, client, TOY_TARGET, n_runs=3, temperature=0.7)

    assert isinstance(report, CaseReport)
    assert report.case_id == "c1"
    assert len(report.runs) == 3
    assert report.error_rate == 0.0
    assert report.mean_scores["goodness"] == 1.0
    assert all(r.error is None for r in report.runs)


def test_run_case_records_client_error_as_failure_not_exclusion():
    case = {"id": "c1"}
    client = _ScriptedClient([RuntimeError("ollama down")])
    report = run_case(case, client, TOY_TARGET, n_runs=2, temperature=0.7)

    assert report.error_rate == 1.0
    assert all(r.error is not None for r in report.runs)
    assert report.mean_scores["goodness"] == 0.0


def test_run_case_records_scoring_error_as_failure():
    case = {"id": "c1"}
    client = _ScriptedClient(["bad"])
    report = run_case(case, client, TOY_TARGET, n_runs=1, temperature=0.7)

    assert report.error_rate == 1.0
    assert "garbage" in report.runs[0].error


def test_run_case_mixed_success_and_failure_consistency():
    case = {"id": "c1"}
    client = _ScriptedClient(["good", RuntimeError("flaky")])
    report = run_case(case, client, TOY_TARGET, n_runs=2, temperature=0.7)

    assert report.error_rate == 0.5
    # One run scored 1.0, one scored 0.0 -> mean 0.5, nonzero stdev.
    assert report.mean_scores["goodness"] == 0.5
    assert report.consistency_stdev["goodness"] > 0.0


def test_case_report_consistency_needs_two_runs():
    report = CaseReport(case_id="c1", metrics=METRICS, runs=[RunResult(scores={"goodness": 1.0})])
    assert report.consistency_stdev["goodness"] == 0.0


def test_case_report_empty_runs():
    report = CaseReport(case_id="c1", metrics=METRICS, runs=[])
    assert report.mean_scores["goodness"] == 0.0
    assert report.error_rate == 0.0


def test_run_suite_builds_one_case_report_per_dataset_case(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}, {"id": "b"}]}')
    client = _ScriptedClient(["good"])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=2)

    assert len(report.cases) == 2
    assert {c.case_id for c in report.cases} == {"a", "b"}


def test_suite_report_to_dict_shape(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["good"])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=2)
    result = report.to_dict()

    assert len(result["cases"]) == 1
    case = result["cases"][0]
    assert case["runs"] == 2
    assert set(case["mean_scores"].keys()) == {"goodness"}


@pytest.mark.parametrize("min_thresholds", [{}, {"goodness": 0.5}])
def test_overall_pass_true_for_high_quality_runs(tmp_path, min_thresholds):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["good"])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=2)
    assert report.overall_pass(min_thresholds, {}, max_error_rate=1.0) is True


def test_overall_pass_false_below_min_threshold(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["ok"])  # scores 0.5, not "good"
    report = run_suite(dataset, client, TOY_TARGET, n_runs=1)
    assert report.overall_pass({"goodness": 0.9}, {}, max_error_rate=1.0) is False


def test_overall_pass_false_above_max_threshold(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["good"])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=1)
    assert report.overall_pass({}, {"goodness": 0.9}, max_error_rate=1.0) is False


def test_overall_pass_false_when_a_case_errors_out(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient([RuntimeError("down")])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=2)
    assert report.overall_pass({}, {}, max_error_rate=0.2) is False
