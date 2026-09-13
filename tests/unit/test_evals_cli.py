"""Unit tests for evals/cli.py — the OllamaClient class is monkeypatched
with a stub, so these never require a real Ollama server or network access."""
import json

import pytest

import evals.cli as cli_module


class _StubClient:
    def __init__(self, host=None, model=None):
        self.host = host
        self.model = model

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        # Covers every required_keyword across every case in
        # evals/datasets/test_generation.json so this stub scores well
        # regardless of which dataset case it's answering for.
        return json.dumps({"test_cases": [{
            "title": "Login, reset, and export scenario",
            "description": "login password invalid lockout reset email link expired csv export empty",
            "steps": "1. Do the thing\n2. Check the result",
            "expected_result": "Behaves as expected",
            "priority": "high",
        }] * 4})


def test_main_prints_report_and_returns_zero(monkeypatch, capsys):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    exit_code = cli_module.main(["--runs", "1"])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert len(printed["cases"]) == 3


def test_main_writes_output_file(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    out_path = tmp_path / "report.json"
    cli_module.main(["--runs", "1", "--output", str(out_path)])

    written = json.loads(out_path.read_text())
    assert len(written["cases"]) == 3


def test_main_gate_passes_on_good_output(monkeypatch):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    assert cli_module.main(["--runs", "1", "--gate"]) == 0


def test_main_gate_fails_on_errors(monkeypatch, capsys):
    class _FailingClient(_StubClient):
        def generate(self, system_prompt, user_prompt, temperature=0.7):
            raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(cli_module, "OllamaClient", _FailingClient)
    exit_code = cli_module.main(["--runs", "1", "--gate"])

    assert exit_code == 1
    assert "EVAL GATE FAILED" in capsys.readouterr().err


class _TriageStubClient:
    def __init__(self, host=None, model=None):
        self.host = host
        self.model = model

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        return (
            "These failures share a timeout during login and an export error in the reporting suite. "
            "The session appears to expire before the redirect completes. Check the auth service's "
            "session config and the CSV export handler for empty suites."
        )


def test_main_runs_triage_target(monkeypatch, capsys):
    monkeypatch.setattr(cli_module, "OllamaClient", _TriageStubClient)
    exit_code = cli_module.main(["--target", "triage", "--runs", "1", "--gate"])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed["target"] == "triage"
    assert len(printed["cases"]) == 2


def test_main_rejects_unknown_target():
    with pytest.raises(SystemExit):
        cli_module.main(["--target", "not-a-real-target"])
