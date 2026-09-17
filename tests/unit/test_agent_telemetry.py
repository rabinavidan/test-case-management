"""Unit tests for scripts/agent_telemetry.py — the unified view over
scripts/heal_metrics.py's and scripts/ai_call_metrics.py's separate logs
(course M9). No real filesystem state beyond tmp_path; no network calls.
"""
import json

from scripts.agent_telemetry import main, unified_agent_telemetry


def _write_heal_log(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n")


def _write_ai_call_log(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n")


def test_unified_telemetry_with_no_logs_returns_empty_shaped_summaries(tmp_path):
    result = unified_agent_telemetry(tmp_path / "heal.jsonl", tmp_path / "ai_calls.jsonl")

    assert result["healer"]["total_records"] == 0
    assert result["healer"]["heal_success_rate"] is None
    assert result["ai_gateway"]["total_calls"] == 0
    assert result["ai_gateway"]["error_rate"] is None


def test_unified_telemetry_combines_both_logs(tmp_path):
    heal_log = tmp_path / "heal.jsonl"
    ai_call_log = tmp_path / "ai_calls.jsonl"
    _write_heal_log(heal_log, [
        {"heal_type": "locator_drift", "outcome": "healed"},
        {"heal_type": "behavior_change", "outcome": "escalated"},
    ])
    _write_ai_call_log(ai_call_log, [
        {"provider": "anthropic", "outcome": "success", "tokens_in": 10, "tokens_out": 5, "latency_ms": 100.0},
    ])

    result = unified_agent_telemetry(heal_log, ai_call_log)

    assert result["healer"]["total_records"] == 2
    assert result["healer"]["heal_success_rate"] == 1.0
    assert result["healer"]["false_heal_rate"] == 0.0
    assert result["ai_gateway"]["total_calls"] == 1
    assert result["ai_gateway"]["error_rate"] == 0.0


def test_unified_telemetry_sections_are_independent(tmp_path):
    # A populated heal log alongside a missing ai-call log - each section
    # reflects only its own source, never blends the two.
    heal_log = tmp_path / "heal.jsonl"
    _write_heal_log(heal_log, [{"heal_type": "timing_drift", "outcome": "healed"}])

    result = unified_agent_telemetry(heal_log, tmp_path / "does-not-exist.jsonl")

    assert result["healer"]["total_records"] == 1
    assert result["ai_gateway"]["total_calls"] == 0


def test_main_prints_the_unified_report(tmp_path, capsys, monkeypatch):
    heal_log = tmp_path / "heal.jsonl"
    ai_call_log = tmp_path / "ai_calls.jsonl"
    _write_heal_log(heal_log, [{"heal_type": "locator_drift", "outcome": "healed"}])
    _write_ai_call_log(ai_call_log, [
        {"provider": "ollama", "outcome": "success", "tokens_in": 1, "tokens_out": 1, "latency_ms": 1.0},
    ])

    exit_code = main(["--heal-log", str(heal_log), "--ai-call-log", str(ai_call_log)])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed["healer"]["total_records"] == 1
    assert printed["ai_gateway"]["total_calls"] == 1


def test_main_defaults_to_the_standard_log_paths(capsys):
    # No records at either default path in a fresh checkout - both
    # sections should degrade to "no data" rather than raising.
    exit_code = main([])
    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert "healer" in printed
    assert "ai_gateway" in printed
