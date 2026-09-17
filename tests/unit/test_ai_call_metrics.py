"""Unit tests for scripts/ai_call_metrics.py — per-provider call summary
computed from AI-call telemetry records written by api/ai_gateway.py's
log_ai_call(). No filesystem fixtures beyond tmp_path; no network calls.
"""
import json

from scripts.ai_call_metrics import compute_summary, load_records


def _record(provider, outcome="success", tokens_in=10, tokens_out=5, latency_ms=100.0, **overrides):
    record = {
        "timestamp": "2026-01-01T00:00:00Z",
        "feature": "test_generation",
        "provider": provider,
        "model": "m",
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "latency_ms": latency_ms,
        "outcome": outcome,
    }
    record.update(overrides)
    return record


def test_load_records_returns_empty_list_when_file_missing(tmp_path):
    assert load_records(tmp_path / "does-not-exist.jsonl") == []


def test_load_records_parses_one_json_object_per_line(tmp_path):
    path = tmp_path / "ai_calls.jsonl"
    path.write_text(json.dumps(_record("anthropic")) + "\n" + json.dumps(_record("ollama")) + "\n")
    records = load_records(path)
    assert len(records) == 2
    assert records[0]["provider"] == "anthropic"
    assert records[1]["provider"] == "ollama"


def test_load_records_skips_blank_lines(tmp_path):
    path = tmp_path / "ai_calls.jsonl"
    path.write_text(json.dumps(_record("anthropic")) + "\n\n\n")
    assert len(load_records(path)) == 1


def test_compute_summary_with_no_records_returns_none_rates():
    summary = compute_summary([])
    assert summary == {
        "total_calls": 0,
        "error_rate": None,
        "mean_latency_ms": None,
        "total_tokens_in": 0,
        "total_tokens_out": 0,
        "by_provider": {},
    }


def test_compute_summary_totals_tokens_and_calls_across_providers():
    records = [
        _record("anthropic", tokens_in=10, tokens_out=5),
        _record("ollama", tokens_in=20, tokens_out=8),
    ]
    summary = compute_summary(records)
    assert summary["total_calls"] == 2
    assert summary["total_tokens_in"] == 30
    assert summary["total_tokens_out"] == 13


def test_compute_summary_error_rate_counts_non_success_outcomes():
    records = [
        _record("anthropic", outcome="success"),
        _record("anthropic", outcome="error"),
        _record("anthropic", outcome="success"),
        _record("anthropic", outcome="success"),
    ]
    summary = compute_summary(records)
    assert summary["error_rate"] == 0.25


def test_compute_summary_mean_latency_across_all_calls():
    records = [_record("anthropic", latency_ms=100.0), _record("anthropic", latency_ms=200.0)]
    summary = compute_summary(records)
    assert summary["mean_latency_ms"] == 150.0


def test_compute_summary_by_provider_breakdown():
    records = [
        _record("anthropic", tokens_in=10, tokens_out=5, latency_ms=100.0),
        _record("anthropic", tokens_in=10, tokens_out=5, latency_ms=200.0, outcome="error"),
        _record("ollama", tokens_in=1, tokens_out=1, latency_ms=50.0),
    ]
    summary = compute_summary(records)

    assert summary["by_provider"]["anthropic"]["calls"] == 2
    assert summary["by_provider"]["anthropic"]["error_rate"] == 0.5
    assert summary["by_provider"]["anthropic"]["mean_latency_ms"] == 150.0
    assert summary["by_provider"]["anthropic"]["tokens_in"] == 20

    assert summary["by_provider"]["ollama"]["calls"] == 1
    assert summary["by_provider"]["ollama"]["error_rate"] == 0.0


def test_compute_summary_treats_missing_token_counts_as_zero():
    records = [_record("ollama", tokens_in=None, tokens_out=None)]
    summary = compute_summary(records)
    assert summary["total_tokens_in"] == 0
    assert summary["total_tokens_out"] == 0
