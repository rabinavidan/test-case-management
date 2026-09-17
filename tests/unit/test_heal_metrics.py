"""Unit tests for scripts/heal_metrics.py — heal-success-rate and
false-heal-rate computed from heal outcome records written by the
playwright-test-healer agent. No filesystem fixtures beyond tmp_path/pytest's
own tooling; no network calls.
"""
import json

from scripts.heal_metrics import compute_heal_metrics, load_records


def _record(heal_type, outcome, **overrides):
    record = {
        "timestamp": "2026-01-01T00:00:00Z",
        "spec_file": "e2e/tests/example.spec.ts",
        "test_name": "does the thing",
        "heal_type": heal_type,
        "outcome": outcome,
        "reasoning": "because",
    }
    record.update(overrides)
    return record


def test_load_records_returns_empty_list_when_file_missing(tmp_path):
    assert load_records(tmp_path / "does-not-exist.jsonl") == []


def test_load_records_parses_one_json_object_per_line(tmp_path):
    path = tmp_path / "heal_outcomes.jsonl"
    path.write_text(
        json.dumps(_record("locator_drift", "healed")) + "\n"
        + json.dumps(_record("timing_drift", "escalated")) + "\n"
    )
    records = load_records(path)
    assert len(records) == 2
    assert records[0]["heal_type"] == "locator_drift"
    assert records[1]["outcome"] == "escalated"


def test_load_records_skips_blank_lines(tmp_path):
    path = tmp_path / "heal_outcomes.jsonl"
    path.write_text(json.dumps(_record("locator_drift", "healed")) + "\n\n\n")
    assert len(load_records(path)) == 1


def test_compute_heal_metrics_with_no_records_returns_none_rates():
    metrics = compute_heal_metrics([])
    assert metrics == {
        "total_records": 0,
        "locator_timing_heals": 0,
        "behavior_change_heals": 0,
        "heal_success_rate": None,
        "false_heal_rate": None,
    }


def test_compute_heal_metrics_heal_success_rate_counts_locator_and_timing_together():
    records = [
        _record("locator_drift", "healed"),
        _record("timing_drift", "healed"),
        _record("locator_drift", "skipped"),
        _record("timing_drift", "escalated"),
    ]
    metrics = compute_heal_metrics(records)
    assert metrics["locator_timing_heals"] == 4
    assert metrics["heal_success_rate"] == 0.5


def test_compute_heal_metrics_false_heal_rate_is_zero_when_all_behavior_changes_escalated():
    records = [
        _record("behavior_change", "escalated"),
        _record("behavior_change", "escalated"),
        _record("locator_drift", "healed"),
    ]
    metrics = compute_heal_metrics(records)
    assert metrics["behavior_change_heals"] == 2
    assert metrics["false_heal_rate"] == 0.0


def test_compute_heal_metrics_false_heal_rate_flags_a_silently_healed_behavior_change():
    records = [
        _record("behavior_change", "escalated"),
        _record("behavior_change", "healed"),  # the forbidden false-heal case
    ]
    metrics = compute_heal_metrics(records)
    assert metrics["false_heal_rate"] == 0.5


def test_compute_heal_metrics_false_heal_rate_flags_a_silently_skipped_behavior_change():
    records = [_record("behavior_change", "skipped")]
    metrics = compute_heal_metrics(records)
    assert metrics["false_heal_rate"] == 1.0


def test_compute_heal_metrics_total_records_counts_everything_including_unknown_types():
    records = [
        _record("locator_drift", "healed"),
        _record("behavior_change", "escalated"),
        {"heal_type": "something_unrecognised", "outcome": "healed"},
    ]
    metrics = compute_heal_metrics(records)
    assert metrics["total_records"] == 3
    assert metrics["locator_timing_heals"] == 1
    assert metrics["behavior_change_heals"] == 1
