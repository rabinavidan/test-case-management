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


def _build_judge_prompt(case: dict, raw_response: str) -> tuple:
    return "judge system", f"judge this: {raw_response}"


TOY_TARGET = EvalTarget(name="toy", metrics=METRICS, error_scores=ERROR_SCORES, build_prompt=_build_prompt, score=_score)
TOY_TARGET_WITH_JUDGE = EvalTarget(
    name="toy", metrics=METRICS, error_scores=ERROR_SCORES, build_prompt=_build_prompt, score=_score,
    build_judge_prompt=_build_judge_prompt,
)


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


# --- optional LLM-as-judge scoring -------------------------------------------

def test_run_case_with_no_judge_client_leaves_judge_score_none():
    case = {"id": "c1"}
    client = _ScriptedClient(["good"])
    report = run_case(case, client, TOY_TARGET_WITH_JUDGE, n_runs=2, temperature=0.7)

    assert all(r.judge_score is None for r in report.runs)
    assert report.judge_mean is None
    assert report.judge_consistency_stdev is None


def test_run_case_with_a_target_that_has_no_judge_prompt_ignores_a_judge_client():
    case = {"id": "c1"}
    client = _ScriptedClient(["good"])
    judge_client = _ScriptedClient(['{"score": 0.9}'])
    # TOY_TARGET (not TOY_TARGET_WITH_JUDGE) has no build_judge_prompt.
    report = run_case(case, client, TOY_TARGET, n_runs=1, temperature=0.7, judge_client=judge_client)

    assert report.runs[0].judge_score is None
    assert report.judge_mean is None


def test_run_case_scores_the_judge_alongside_the_deterministic_scorer():
    case = {"id": "c1"}
    client = _ScriptedClient(["good"])
    judge_client = _ScriptedClient(['{"score": 0.8}'])
    report = run_case(case, client, TOY_TARGET_WITH_JUDGE, n_runs=3, temperature=0.7, judge_client=judge_client)

    assert report.mean_scores["goodness"] == 1.0  # deterministic axis unaffected
    assert report.judge_mean == 0.8
    assert report.judge_consistency_stdev == 0.0  # identical judge score every run


def test_run_case_judge_mean_ignores_runs_where_the_judge_call_failed():
    case = {"id": "c1"}
    client = _ScriptedClient(["good"])
    judge_client = _ScriptedClient(['{"score": 0.6}', RuntimeError("judge unreachable")])
    report = run_case(case, client, TOY_TARGET_WITH_JUDGE, n_runs=2, temperature=0.7, judge_client=judge_client)

    assert report.runs[0].judge_score == 0.6
    assert report.runs[1].judge_score is None
    assert report.judge_mean == 0.6  # only the successful judge call counted
    assert report.error_rate == 0.0  # the judge failure didn't fail the run itself


def test_run_case_judge_never_runs_for_a_deterministically_failed_run():
    case = {"id": "c1"}
    client = _ScriptedClient(["bad"])  # _score raises for "bad"
    judge_client = _ScriptedClient(['{"score": 0.9}'])
    report = run_case(case, client, TOY_TARGET_WITH_JUDGE, n_runs=1, temperature=0.7, judge_client=judge_client)

    assert report.runs[0].error is not None
    assert report.runs[0].judge_score is None


def test_suite_report_to_dict_includes_judge_fields(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["good"])
    judge_client = _ScriptedClient(['{"score": 0.7}'])
    report = run_suite(dataset, client, TOY_TARGET_WITH_JUDGE, n_runs=2, judge_client=judge_client)
    case = report.to_dict()["cases"][0]

    assert case["judge_mean"] == 0.7
    assert case["judge_consistency_stdev"] == 0.0


def test_suite_report_to_dict_judge_fields_null_without_a_judge(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text('{"cases": [{"id": "a"}]}')
    client = _ScriptedClient(["good"])
    report = run_suite(dataset, client, TOY_TARGET, n_runs=1)
    case = report.to_dict()["cases"][0]

    assert case["judge_mean"] is None
    assert case["judge_consistency_stdev"] is None
