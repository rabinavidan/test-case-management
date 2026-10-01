"""Unit tests for evals/retrieval_eval.py (course milestone M8)."""
import json

import httpx

from api import embeddings
from evals import retrieval_eval

TINY = {"suites": [{
    "id": "s",
    "corpus": [
        {"id": "a", "title": "Login with valid credentials", "description": ""},
        {"id": "b", "title": "Kafka consumer lag", "description": ""},
    ],
    "queries": [
        {"id": "q1", "text": "login credentials", "relevant": ["a"]},
        {"id": "q2", "text": "sign-in works", "relevant": ["a"]},
    ],
}]}


def test_hash_provider_scores_recall_and_mrr():
    report = retrieval_eval.evaluate_provider(TINY, "hash")
    assert report["model_id"] == embeddings.HASH_MODEL_ID
    assert report["queries"] == 2
    q1 = next(q for q in report["per_query"] if q["id"] == "q1")
    assert q1["rank"] == 1
    assert 0.5 <= report["recall_at_1"] <= 1.0
    assert report["recall_at_3"] == 1.0  # only two docs, so any relevant one is in the top 3


def test_cli_reports_provider_failure_and_threshold(tmp_path, monkeypatch, capsys):
    dataset = tmp_path / "d.json"
    dataset.write_text(json.dumps(TINY))

    def down(url, json, timeout):
        raise httpx.ConnectError("no ollama")

    monkeypatch.setattr(embeddings.httpx, "post", down)
    out = tmp_path / "report.json"
    code = retrieval_eval.main(["--dataset", str(dataset), "--provider", "hash", "--provider", "ollama",
                                "--output", str(out)])
    assert code == 1
    report = json.loads(out.read_text())
    assert "error" in report["ollama"] and report["hash"]["queries"] == 2
    assert "ERROR" in capsys.readouterr().out

    assert retrieval_eval.main(["--dataset", str(dataset), "--min-recall-at-3", "0.5"]) == 0
    assert retrieval_eval.main(["--dataset", str(dataset), "--min-recall-at-3", "1.01"]) == 1


def test_bundled_dataset_is_well_formed():
    data = json.loads(retrieval_eval.DEFAULT_DATASET.read_text())
    for suite in data["suites"]:
        ids = {d["id"] for d in suite["corpus"]}
        for q in suite["queries"]:
            assert q["relevant"] and set(q["relevant"]) <= ids
