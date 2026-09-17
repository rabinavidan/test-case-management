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
    check_regressions,
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


def test_write_then_load_baseline_round_trips(tmp_path):
    report = _make_report(tmp_path, "1.0")
    path = write_baseline(report, "qwen2.5:0.5b", "toy")
    assert path.exists()

    loaded = load_baseline("qwen2.5:0.5b", "toy")
    assert loaded["model"] == "qwen2.5:0.5b"
    assert loaded["cases"][0]["mean_scores"]["goodness"] == 1.0


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
