"""evals/export_reviews.py: how reviews become an eval dataset."""
import json

from evals import export_reviews
from evals.export_reviews import reviews_to_dataset
from evals.harness import load_dataset

OUT = {"title": "Login works", "priority": "medium"}


def _review(id, verdict, **kw):
    return {"id": id, "verdict": verdict, "feature_description": "Login", "suite_name": "Auth",
            "batch_size": 4, "model": "m", "reviewer": "r", "created_at": "2026-10-17T00:00:00+00:00",
            "output": OUT, "edited": None, "reason": None, "must_cover": [], **kw}


def test_rejections_with_keywords_become_cases_and_the_rest_are_kept_for_people():
    ds = reviews_to_dataset([
        _review(3, "rejected", reason="vague"),
        _review(1, "rejected", reason="no lockout", must_cover=["lockout"]),
        _review(2, "edited", edited={"title": "Login works with a valid password", "priority": "high"}),
        _review(4, "accepted"),
    ])
    [case] = ds["cases"]
    assert case["id"] == "human-review-1"
    assert case["count"] == 4 and case["required_keywords"] == ["lockout"]
    assert case["suite_name"] == "Auth" and case["category"] == "human_review"
    assert [u["review_id"] for u in ds["unscored_rejections"]] == [3]
    [edit] = ds["human_edits"]
    assert edit["model_output"] == OUT and edit["human_version"]["priority"] == "high"


def test_cli_writes_a_dataset_the_harness_loads(tmp_path, monkeypatch):
    class Res:
        def raise_for_status(self): pass
        def json(self): return [_review(1, "rejected", reason="no lockout", must_cover=["lockout"])]

    seen = {}
    monkeypatch.setattr(export_reviews.httpx, "get", lambda url, headers, timeout: seen.update(url=url, headers=headers) or Res())
    out = tmp_path / "human_reviews.json"
    assert export_reviews.main(["--base-url", "http://x/", "--token", "t", "--output", str(out)]) == 0
    assert seen == {"url": "http://x/api/ai/reviews", "headers": {"Authorization": "Bearer t"}}
    cases = load_dataset(out)
    assert [c["id"] for c in cases] == ["human-review-1"]
    assert json.loads(out.read_text(encoding="utf-8"))["unscored_rejections"] == []
