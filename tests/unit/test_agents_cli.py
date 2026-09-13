"""Unit tests for agents/cli.py — review_and_fill_gaps is monkeypatched
directly, so these never require a real Ollama server."""
import json

import agents.cli as cli_module
from agents.test_plan_reviewer import PlanReviewError


def test_main_prints_result_and_returns_zero(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(cli_module, "review_and_fill_gaps", lambda *a, **k: {"gaps": ["g"], "new_test_cases": []})
    exit_code = cli_module.main(["--feature", "Login"])

    assert exit_code == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed == {"gaps": ["g"], "new_test_cases": []}


def test_main_reads_existing_test_cases_file(monkeypatch, tmp_path):
    existing_path = tmp_path / "existing.json"
    existing_path.write_text(json.dumps([{"title": "Login with valid credentials"}]))
    captured = {}

    def fake_review(feature, existing_test_cases, model=None, host=None):
        captured["feature"] = feature
        captured["existing"] = existing_test_cases
        return {"gaps": [], "new_test_cases": []}

    monkeypatch.setattr(cli_module, "review_and_fill_gaps", fake_review)
    cli_module.main(["--feature", "Login", "--existing", str(existing_path)])

    assert captured["feature"] == "Login"
    assert captured["existing"] == [{"title": "Login with valid credentials"}]


def test_main_writes_output_file(monkeypatch, tmp_path):
    monkeypatch.setattr(cli_module, "review_and_fill_gaps", lambda *a, **k: {"gaps": [], "new_test_cases": []})
    out_path = tmp_path / "result.json"
    cli_module.main(["--feature", "Login", "--output", str(out_path)])

    assert json.loads(out_path.read_text()) == {"gaps": [], "new_test_cases": []}


def test_main_returns_one_and_prints_error_on_review_failure(monkeypatch, capsys):
    def fake_review(*a, **k):
        raise PlanReviewError("Coverage-gap review failed: boom")

    monkeypatch.setattr(cli_module, "review_and_fill_gaps", fake_review)
    exit_code = cli_module.main(["--feature", "Login"])

    assert exit_code == 1
    assert "Test Plan Reviewer failed" in capsys.readouterr().err
