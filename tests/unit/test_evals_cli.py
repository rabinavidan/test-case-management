"""Unit tests for evals/cli.py — the OllamaClient class is monkeypatched
with a stub, so these never require a real Ollama server or network access."""
import json

import pytest

import evals.baseline as baseline_module
import evals.cli as cli_module


class _StubClient:
    def __init__(self, host=None, model=None):
        self.host = host
        self.model = model

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        # Covers every required_keyword across every one of the dataset's 15
        # cases (see evals/README.md's "Golden datasets" section) and
        # returns 5 copies - the dataset's largest "count" - so this stub
        # scores well regardless of which dataset case it's answering for.
        kitchen_sink = (
            "login password invalid lockout reset email link expired csv export empty "
            "create rename delete admin priority filter status pass fail percentage zero "
            "environment staging prod unrecognised pagination search bulk partial failure "
            "websocket reconnect resync live viewer 403 role "
            "'api key' 503 'invalid json' 502 kafka event idempotent redelivered "
            "seed duplicate concurrent contact 'required field' 'invalid email' 'rate-limited'"
        )
        return json.dumps({"test_cases": [{
            "title": "Login, reset, and export scenario",
            "description": kitchen_sink,
            "steps": "1. Do the thing\n2. Check the result",
            "expected_result": "Behaves as expected",
            "priority": "high",
        }] * 5})


def test_main_prints_report_and_returns_zero(monkeypatch, capsys):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    exit_code = cli_module.main(["--runs", "1"])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert len(printed["cases"]) == 15


def test_main_writes_output_file(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    out_path = tmp_path / "report.json"
    cli_module.main(["--runs", "1", "--output", str(out_path)])

    written = json.loads(out_path.read_text())
    assert len(written["cases"]) == 15


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
        # Covers every required_keyword across every one of the dataset's 15
        # cases (see evals/README.md's "Golden datasets" section), 4
        # sentences (within sentence_count_score's 2-6 range), no literal
        # [FAIL]/[SKIP] markers (keeps verbatim_echo_rate at 0).
        return (
            "These failures span session timeout and login issues, environment mismatch between "
            "staging and preprod, and flaky retry timing during E2E runs. "
            "Export and CSV errors include empty suite handling and pagination search boundaries, "
            "while permission checks return 403 for viewers without proper role enforcement, and "
            "repeated contact submissions are not rate limited within the cooldown, returning no 429. "
            "WebSocket reconnect leaves stale state, Kafka consumer lag delays event delivery, "
            "concurrent admin edits create a race and conflict with a database constraint violation "
            "and duplicate suite names without clear validation, and a bulk import of a large payload "
            "exceeds its timeout. "
            "The AI generation endpoint needs a valid api key or returns 503, a malformed model "
            "response causes a failure, an unrelated email provider outage also triggered a "
            "temporary 503, and a rendering exception with a null pointer explains an unrelated "
            "verbatim-echo case."
        )


def test_main_runs_triage_target(monkeypatch, capsys):
    monkeypatch.setattr(cli_module, "OllamaClient", _TriageStubClient)
    exit_code = cli_module.main(["--target", "triage", "--runs", "1", "--gate"])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed["target"] == "triage"
    assert len(printed["cases"]) == 15


def test_main_rejects_unknown_target():
    with pytest.raises(SystemExit):
        cli_module.main(["--target", "not-a-real-target"])


# --- --record-baseline / baseline-aware --gate -------------------------------

def test_main_record_baseline_writes_a_reviewable_file(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    monkeypatch.setattr(baseline_module, "BASELINE_DIR", tmp_path / "baselines")

    exit_code = cli_module.main(["--runs", "1", "--model", "test-model", "--record-baseline"])

    assert exit_code == 0
    path = baseline_module.baseline_path("test-model", "test_generation")
    assert path.exists()
    written = json.loads(path.read_text())
    assert written["model"] == "test-model"
    assert len(written["cases"]) == 15


def test_main_gate_passes_against_a_matching_baseline(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    monkeypatch.setattr(baseline_module, "BASELINE_DIR", tmp_path / "baselines")
    cli_module.main(["--runs", "1", "--model", "test-model", "--record-baseline"])

    # Same stub, same model - a genuine re-run of the same conditions, not a regression.
    assert cli_module.main(["--runs", "1", "--model", "test-model", "--gate"]) == 0


def test_main_gate_fails_on_regression_against_a_recorded_baseline(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    monkeypatch.setattr(baseline_module, "BASELINE_DIR", tmp_path / "baselines")
    cli_module.main(["--runs", "1", "--model", "test-model", "--record-baseline"])

    class _RegressedClient(_StubClient):
        def generate(self, system_prompt, user_prompt, temperature=0.7):
            # Schema-invalid, keyword-empty response - well below the
            # healthy baseline just recorded above, not ordinary noise.
            return json.dumps({"test_cases": [{"title": "t"}]})

    monkeypatch.setattr(cli_module, "OllamaClient", _RegressedClient)
    exit_code = cli_module.main(["--runs", "1", "--model", "test-model", "--gate"])

    assert exit_code == 1
    err = capsys.readouterr().err
    assert "EVAL GATE FAILED" in err
    assert "regression vs. the recorded baseline" in err


def test_main_gate_falls_back_to_fixed_thresholds_without_a_baseline(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "OllamaClient", _StubClient)
    monkeypatch.setattr(baseline_module, "BASELINE_DIR", tmp_path / "baselines")

    # No --record-baseline call first - this model has no recorded baseline,
    # so --gate must fall back to the existing fixed-threshold check.
    assert cli_module.main(["--runs", "1", "--model", "never-baselined-model", "--gate"]) == 0
