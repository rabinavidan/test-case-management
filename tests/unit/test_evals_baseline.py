"""Unit tests for evals/baseline.py — a synthetic EvalTarget stands in for a
real feature (same convention as test_evals_harness.py), so these aren't
coupled to test_generation's or triage's specific scorers. Nothing here
requires a real Ollama server.
"""
import json

import pytest

import evals.baseline as baseline_module
from evals.baseline import (
    baseline_path,
    build_baseline,
    check_error_rates,
    check_regressions,
    check_suite_regressions,
    compute_prompt_delta,
    load_baseline,
    sanitize_model_name,
    write_baseline,
)
from evals.harness import EvalTarget, run_suite

METRICS = ("goodness", "badness")
ERROR_SCORES = {"goodness": 0.0, "badness": 1.0}
MIN_THRESHOLDS = {"goodness": 0.5}
MAX_THRESHOLDS = {"badness": 0.5}


def _build_prompt(case: dict) -> tuple:
    return "system", f"describe {case['id']}"


def _score(raw: str, case: dict) -> dict:
    return {"goodness": float(raw), "badness": 1.0 - float(raw)}


TOY_TARGET = EvalTarget(name="toy", metrics=METRICS, error_scores=ERROR_SCORES, build_prompt=_build_prompt, score=_score)


class _ScriptedClient:
    def __init__(self, responses):
        self._responses = responses
        self._i = 0

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        response = self._responses[self._i % len(self._responses)]
        self._i += 1
        return response


@pytest.fixture(autouse=True)
def _isolated_baseline_dir(tmp_path, monkeypatch):
    """Every test gets its own scratch baseline directory so none of them
    touch (or depend on) evals/baselines/ actually checked into the repo."""
    monkeypatch.setattr(baseline_module, "BASELINE_DIR", tmp_path / "baselines")


def test_sanitize_model_name_strips_filesystem_unsafe_characters():
    assert sanitize_model_name("qwen2.5:0.5b") == "qwen2.5_0.5b"
    assert sanitize_model_name("simple") == "simple"


def test_baseline_path_uses_sanitized_model_and_target():
    path = baseline_path("qwen2.5:0.5b", "test_generation")
    assert path == baseline_module.BASELINE_DIR / "qwen2.5_0.5b" / "test_generation.json"


def _make_report(tmp_path, response):
    dataset = tmp_path / "toy.json"
    dataset.write_text(json.dumps({"cases": [{"id": "a"}]}))
    client = _ScriptedClient([response])
    return run_suite(dataset, client, TOY_TARGET, n_runs=3)


def test_build_baseline_includes_model_and_target(tmp_path):
    report = _make_report(tmp_path, "1.0")
    result = build_baseline(report, "qwen2.5:0.5b", "toy")
    assert result["model"] == "qwen2.5:0.5b"
    assert result["target"] == "toy"
    assert result["cases"][0]["case_id"] == "a"


def test_build_baseline_defaults_prompt_fields_to_none(tmp_path):
    report = _make_report(tmp_path, "1.0")
    result = build_baseline(report, "m", "toy")
    assert result["prompt_id"] is None
    assert result["prompt_version"] is None


def test_build_baseline_records_prompt_id_and_version(tmp_path):
    report = _make_report(tmp_path, "1.0")
    result = build_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="abc12345")
    assert result["prompt_id"] == "toy_prompt"
    assert result["prompt_version"] == "abc12345"


def test_write_then_load_baseline_round_trips(tmp_path):
    report = _make_report(tmp_path, "1.0")
    path = write_baseline(report, "qwen2.5:0.5b", "toy")
    assert path.exists()

    loaded = load_baseline("qwen2.5:0.5b", "toy")
    assert loaded["model"] == "qwen2.5:0.5b"
    assert loaded["cases"][0]["mean_scores"]["goodness"] == 1.0


def test_write_baseline_records_prompt_version(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="v1hash")
    loaded = load_baseline("m", "toy")
    assert loaded["prompt_id"] == "toy_prompt"
    assert loaded["prompt_version"] == "v1hash"


def test_load_baseline_returns_none_when_not_recorded():
    assert load_baseline("some-model", "toy") is None


def test_check_regressions_empty_when_current_matches_baseline(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy")
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "1.0")
    assert check_regressions(current, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


def test_check_regressions_empty_for_a_small_deviation_within_the_noise_band(tmp_path):
    # Baseline recorded with real run-to-run variance (mix of 1.0 and 0.8),
    # so its consistency_stdev is nonzero and the noise band isn't just the
    # absolute floor.
    dataset = tmp_path / "toy.json"
    dataset.write_text(json.dumps({"cases": [{"id": "a"}]}))
    client = _ScriptedClient(["1.0", "0.8"])
    baseline_report = run_suite(dataset, client, TOY_TARGET, n_runs=6)
    write_baseline(baseline_report, "m", "toy")
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "0.85")  # inside the band, not a regression
    assert check_regressions(current, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


def test_check_regressions_flags_a_drop_below_the_band_for_a_min_gated_metric(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy")
    baseline = load_baseline("m", "toy")

    regressed = _make_report(tmp_path, "0.1")  # goodness crashes from 1.0 to 0.1
    findings = check_regressions(regressed, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS)
    assert any("goodness" in f and "a.goodness" in f for f in findings)


def test_check_regressions_flags_a_rise_above_the_band_for_a_max_gated_metric(tmp_path):
    report = _make_report(tmp_path, "1.0")  # badness = 0.0
    write_baseline(report, "m", "toy")
    baseline = load_baseline("m", "toy")

    regressed = _make_report(tmp_path, "0.0")  # badness jumps from 0.0 to 1.0
    findings = check_regressions(regressed, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS)
    assert any("badness" in f for f in findings)


def test_check_regressions_ignores_a_metric_gated_by_neither_threshold_dict(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy")
    baseline = load_baseline("m", "toy")

    regressed = _make_report(tmp_path, "0.0")
    # Gate on neither metric - nothing should be flagged even though both swung wildly.
    assert check_regressions(regressed, baseline, {}, {}) == []


def test_check_regressions_skips_a_case_missing_from_the_baseline(tmp_path):
    dataset = tmp_path / "toy.json"
    dataset.write_text(json.dumps({"cases": [{"id": "a"}]}))
    client = _ScriptedClient(["1.0"])
    baseline_report = run_suite(dataset, client, TOY_TARGET, n_runs=1)
    write_baseline(baseline_report, "m", "toy")
    baseline = load_baseline("m", "toy")

    # A different, newly-added case with no baseline entry yet.
    dataset2 = tmp_path / "toy2.json"
    dataset2.write_text(json.dumps({"cases": [{"id": "b"}]}))
    new_case_report = run_suite(dataset2, client, TOY_TARGET, n_runs=1)
    assert check_regressions(new_case_report, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


# --- compute_prompt_delta (course M7) ----------------------------------------

def test_compute_prompt_delta_prompt_changed_true_when_versions_differ(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="v1")
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "1.0")
    delta = compute_prompt_delta(current, baseline, "toy_prompt", "v2")
    assert delta["prompt_changed"] is True
    assert delta["baseline_prompt_version"] == "v1"
    assert delta["current_prompt_version"] == "v2"


def test_compute_prompt_delta_prompt_changed_false_when_versions_match(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="v1")
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "1.0")
    delta = compute_prompt_delta(current, baseline, "toy_prompt", "v1")
    assert delta["prompt_changed"] is False


def test_compute_prompt_delta_prompt_changed_none_when_baseline_predates_versioning(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy")  # no prompt_id/prompt_version - a pre-M7 baseline
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "1.0")
    delta = compute_prompt_delta(current, baseline, "toy_prompt", "v1")
    assert delta["prompt_changed"] is None


def test_compute_prompt_delta_per_case_metric_deltas(tmp_path):
    report = _make_report(tmp_path, "1.0")  # goodness=1.0, badness=0.0
    write_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="v1")
    baseline = load_baseline("m", "toy")

    current = _make_report(tmp_path, "0.7")  # goodness=0.7, badness=0.3
    delta = compute_prompt_delta(current, baseline, "toy_prompt", "v2")
    assert delta["per_case_delta"]["a"]["goodness"] == pytest.approx(-0.3)
    assert delta["per_case_delta"]["a"]["badness"] == pytest.approx(0.3)


def test_compute_prompt_delta_skips_a_case_missing_from_the_baseline(tmp_path):
    report = _make_report(tmp_path, "1.0")
    write_baseline(report, "m", "toy", prompt_id="toy_prompt", prompt_version="v1")
    baseline = load_baseline("m", "toy")

    dataset2 = tmp_path / "toy2.json"
    dataset2.write_text(json.dumps({"cases": [{"id": "b"}]}))
    client = _ScriptedClient(["1.0"])
    new_case_report = run_suite(dataset2, client, TOY_TARGET, n_runs=1)

    delta = compute_prompt_delta(new_case_report, baseline, "toy_prompt", "v1")
    assert delta["per_case_delta"] == {}


def _scripted_report(tmp_path, responses, n_runs, name="toy.json"):
    dataset = tmp_path / name
    dataset.write_text(json.dumps({"cases": [{"id": "a"}]}))
    return run_suite(dataset, _ScriptedClient(responses), TOY_TARGET, n_runs=n_runs)


def test_one_or_two_runs_changing_out_of_five_is_noise_not_a_regression(tmp_path):
    """The eval-harness failure mode this guards against: a baseline that
    happened to record stdev 0 (5/5 runs alike) turned a single different run
    into a 'regression' because the band was 0.05 and one run is 0.2."""
    write_baseline(_scripted_report(tmp_path, ["1.0"], 5), "m", "toy")
    baseline = load_baseline("m", "toy")
    one_off = _scripted_report(tmp_path, ["1.0", "1.0", "1.0", "1.0", "0.0"], 5)
    two_off = _scripted_report(tmp_path, ["1.0", "1.0", "1.0", "0.0", "0.0"], 5)
    assert check_regressions(one_off, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []
    assert check_regressions(two_off, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


def test_three_runs_changing_out_of_five_is_still_a_regression(tmp_path):
    write_baseline(_scripted_report(tmp_path, ["1.0"], 5), "m", "toy")
    baseline = load_baseline("m", "toy")
    three_off = _scripted_report(tmp_path, ["1.0", "1.0", "0.0", "0.0", "0.0"], 5)
    findings = check_regressions(three_off, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS)
    assert any(f.startswith("a.goodness") for f in findings)
    assert any(f.startswith("a.badness") for f in findings)


def test_error_rate_is_judged_against_the_baseline_not_only_the_fixed_limit(tmp_path):
    erroring = ["1.0", "not-a-number", "not-a-number", "not-a-number", "1.0"]  # 60% unparseable
    write_baseline(_scripted_report(tmp_path, erroring, 5), "m", "toy")
    baseline = load_baseline("m", "toy")
    assert baseline["cases"][0]["error_rate"] == pytest.approx(0.6)

    same = _scripted_report(tmp_path, erroring, 5)
    assert check_error_rates(same, baseline, max_error_rate=0.2) == []  # as bad as recorded: not a regression

    worse_baseline = {"cases": [{"case_id": "a", "error_rate": 0.0}]}
    findings = check_error_rates(same, worse_baseline, max_error_rate=0.2)
    assert findings and "error rate 60%" in findings[0]


def test_error_rate_floor_still_applies_to_a_clean_baseline(tmp_path):
    write_baseline(_scripted_report(tmp_path, ["1.0"], 5), "m", "toy")
    baseline = load_baseline("m", "toy")
    one_error = _scripted_report(tmp_path, ["1.0", "1.0", "1.0", "1.0", "x"], 5)  # 20%
    three_errors = _scripted_report(tmp_path, ["1.0", "1.0", "x", "x", "x"], 5)  # 60%
    assert check_error_rates(one_error, baseline, max_error_rate=0.2) == []
    assert check_error_rates(three_errors, baseline, max_error_rate=0.2)


class _PerCaseClient:
    """Answers by case id: {case_id: [responses cycled per run]}."""
    def __init__(self, by_case):
        self.by_case = {k: list(v) for k, v in by_case.items()}
        self.i = {k: 0 for k in by_case}

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        case = user_prompt.split()[-1]
        r = self.by_case[case][self.i[case] % len(self.by_case[case])]
        self.i[case] += 1
        return r


def _suite(tmp_path, by_case, n_runs=5):
    dataset = tmp_path / "suite.json"
    dataset.write_text(json.dumps({"cases": [{"id": cid} for cid in by_case]}))
    return run_suite(dataset, _PerCaseClient(by_case), TOY_TARGET, n_runs=n_runs)


CASES = [f"c{i}" for i in range(15)]


def test_one_case_swinging_hard_does_not_fail_the_suite_gate(tmp_path):
    """The CI failure after the first fix: one case 1.0 -> 0.4 (3 of 5 runs)
    on an unchanged prompt. Reported per case, not a suite regression."""
    write_baseline(_suite(tmp_path, {c: ["1.0"] for c in CASES}), "m", "toy")
    baseline = load_baseline("m", "toy")
    current = _suite(tmp_path, {**{c: ["1.0"] for c in CASES}, "c3": ["1.0", "1.0", "0.0", "0.0", "0.0"]})
    assert check_regressions(current, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS)  # still visible per case
    assert check_suite_regressions(current, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


def test_a_drop_across_every_case_fails_the_suite_gate(tmp_path):
    write_baseline(_suite(tmp_path, {c: ["1.0"] for c in CASES}), "m", "toy")
    baseline = load_baseline("m", "toy")
    broken = _suite(tmp_path, {c: ["1.0", "1.0", "0.0", "0.0", "0.0"] for c in CASES})  # every case 1.0 -> 0.4
    findings = check_suite_regressions(broken, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS)
    assert any(f.startswith("suite mean goodness") for f in findings)
    assert any(f.startswith("suite mean badness") for f in findings)


def test_suite_gate_tolerates_drift_inside_the_band(tmp_path):
    write_baseline(_suite(tmp_path, {c: ["1.0"] for c in CASES}), "m", "toy")
    baseline = load_baseline("m", "toy")
    drift = _suite(tmp_path, {c: ["1.0", "1.0", "1.0", "1.0", "0.0"] for c in CASES})  # every case -0.2
    assert check_suite_regressions(drift, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []


def test_suite_gate_only_compares_cases_present_in_both(tmp_path):
    write_baseline(_suite(tmp_path, {"c0": ["1.0"]}), "m", "toy")
    baseline = load_baseline("m", "toy")
    current = _suite(tmp_path, {"c0": ["1.0"], "new-case": ["0.0"]})  # no baseline for new-case
    assert check_suite_regressions(current, baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []
    assert check_suite_regressions(_suite(tmp_path, {"other": ["0.0"]}), baseline, MIN_THRESHOLDS, MAX_THRESHOLDS) == []
