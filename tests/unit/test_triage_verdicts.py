"""Unit tests for the deterministic triage verdict baseline
(api/triage_agent.heuristic_verdict) and its labelled eval
(evals/triage_verdict_eval.py). No database, no model."""
import json

import pytest

from api.triage_agent import heuristic_verdict
from evals import triage_verdict_eval


def _ev(prior=(), env=None, others=()):
    prior = list(prior)
    flips = sum(1 for a, b in zip(prior + ["fail"], (prior + ["fail"])[1:]) if a != b)
    return {"prior_statuses": prior, "flip_count": flips, "environment": env,
            "other_environments": [{"environment": k, "status": s} for k, s in others]}


HEALTHY = {"key": "staging", "status": "healthy"}
DOWN = {"key": "preprod", "status": "down"}


@pytest.mark.parametrize("evidence, expected", [
    (_ev(["pass", "pass"], HEALTHY), "product_bug"),
    (_ev([], HEALTHY, [("preprod", "fail")]), "product_bug"),
    (_ev(["pass", "fail", "pass"]), "flaky"),
    (_ev([], DOWN, [("staging", "pass")]), "environment"),
    # environment outranks a flaky-looking history when the env is unhealthy
    (_ev(["pass", "fail", "pass"], DOWN, [("staging", "pass")]), "environment"),
    # unhealthy env but nowhere to compare -> not enough to blame it
    (_ev([], DOWN), "unknown"),
    # fails everywhere but this env is down -> can't tell bug from env
    (_ev([], DOWN, [("staging", "fail")]), "unknown"),
    (_ev([], HEALTHY), "unknown"),
])
def test_heuristic_verdict_rules(evidence, expected):
    verdict, why = heuristic_verdict(evidence)
    assert verdict == expected
    assert why


def test_eval_separates_abstentions_from_confident_errors():
    dataset = {"cases": [
        {"id": "a", "expected": "flaky", "evidence": _ev(["pass", "fail", "pass"])},
        {"id": "b", "expected": "product_bug", "evidence": _ev([], HEALTHY)},  # heuristic abstains
        {"id": "c", "expected": "environment", "evidence": _ev(["pass", "pass"], HEALTHY)},  # wrong
    ]}
    report = triage_verdict_eval.evaluate(dataset, triage_verdict_eval.heuristic_classifier, repeats=2)
    assert report["cases"] == 3
    assert report["accuracy"] == 0.333
    assert report["coverage"] == 0.667
    assert report["precision"] == 0.5
    assert report["confident_errors"] == 1
    assert report["repeatable"] is True


def test_eval_flags_non_repeatable_classifier():
    answers = iter(["flaky", "product_bug"])
    report = triage_verdict_eval.evaluate(
        {"cases": [{"id": "a", "expected": "flaky", "evidence": {}}]}, lambda ev: next(answers), repeats=2)
    assert report["repeatable"] is False


def test_eval_rejects_out_of_vocabulary_verdict():
    with pytest.raises(ValueError):
        triage_verdict_eval.evaluate({"cases": [{"id": "a", "expected": "flaky", "evidence": {}}]},
                                     lambda ev: "maybe")


def test_golden_set_heuristic_makes_no_confident_errors(tmp_path):
    out = tmp_path / "report.json"
    assert triage_verdict_eval.main(["--max-confident-errors", "0", "--min-coverage", "0.7",
                                     "--output", str(out)]) == 0
    report = json.loads(out.read_text())
    assert report["confident_errors"] == 0
    assert report["precision"] == 1.0


def test_cli_fails_when_coverage_gate_not_met(capsys):
    assert triage_verdict_eval.main(["--min-coverage", "0.99"]) == 1
    assert "coverage below" in capsys.readouterr().out
