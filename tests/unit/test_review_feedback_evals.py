"""Course milestone M9, eval side: the rejected_repeat_rate scorer, the two
human-review eval targets, and scripts/export_review_dataset.py."""
import json

import pytest

from api.ai_prompts import build_testcase_generation_user_prompt, prompt_version as api_prompt_version
from evals.harness import load_dataset
from evals.prompt_versions import prompt_version as evals_prompt_version
from evals.scorers import rejected_repeat_rate
from evals.targets import TARGETS
from evals.targets._reviewed_shared import DEFAULT_DATASET, score
from scripts import export_review_dataset as export

CASE = {
    "id": "c1", "suite_name": "Auth", "feature_description": "Password reset", "count": 2,
    "rejected": [{"title": "Verify the reset page loads", "reason": "Too vague"}],
}


def _response(*titles):
    return json.dumps({"test_cases": [
        {"title": t, "description": "d", "steps": "s", "expected_result": "e", "priority": "medium"} for t in titles
    ]})


# ─── scorer ──────────────────────────────────────────────────────────────────

def test_rejected_repeat_rate_flags_a_repeated_rejected_draft():
    cases = [{"title": "Verify the reset page loads"}, {"title": "Expired reset link is refused"}]
    assert rejected_repeat_rate(cases, ["Verify the reset page loads"]) == 0.5


@pytest.mark.parametrize("cases, rejected", [([], ["x"]), ([{"title": "x"}], [])])
def test_rejected_repeat_rate_is_zero_with_nothing_to_compare(cases, rejected):
    assert rejected_repeat_rate(cases, rejected) == 0.0


def test_score_reports_rejected_repeat_rate_and_drops_keyword_coverage():
    scores = score(_response("Verify the reset page loads", "Expired link is refused"), CASE)
    assert scores["rejected_repeat_rate"] == 0.5
    assert "keyword_coverage_score" not in scores
    assert scores["schema_score"] == 1.0 and scores["count_match_score"] == 1.0


# ─── prompts ─────────────────────────────────────────────────────────────────

def test_the_two_targets_differ_only_in_the_reviewer_feedback_block():
    _, with_fb = TARGETS["test_generation_reviewed"].TARGET.build_prompt(CASE)
    _, without_fb = TARGETS["test_generation_reviewed_no_feedback"].TARGET.build_prompt(CASE)
    assert without_fb == build_testcase_generation_user_prompt("Auth", "Password reset", 2)
    assert with_fb.startswith(without_fb)
    assert "- Verify the reset page loads: Too vague" in with_fb


def test_api_and_evals_prompt_versions_agree():
    assert api_prompt_version("some prompt") == evals_prompt_version("some prompt")


def test_reviewed_targets_gate_rejected_repeats():
    for name in ("test_generation_reviewed", "test_generation_reviewed_no_feedback"):
        assert TARGETS[name].DEFAULT_MAX_THRESHOLDS == {"rejected_repeat_rate": 0.2}
        assert TARGETS[name].DEFAULT_DATASET == DEFAULT_DATASET


def test_committed_dataset_has_valid_cases():
    cases = load_dataset(DEFAULT_DATASET)
    assert cases, "the reviewed dataset must not be empty"
    assert len({c["id"] for c in cases}) == len(cases)
    for case in cases:
        assert case["feature_description"] and case["count"] > 0
        assert case["rejected"], f"{case['id']}: an eval case needs at least one rejected draft"
        assert all(r["title"] and r["reason"] for r in case["rejected"])


# ─── export script ───────────────────────────────────────────────────────────

def test_merge_replaces_by_id_appends_new_and_keeps_the_rest():
    existing = [{"id": "seed", "v": 1}, {"id": "review-a", "v": 1}]
    exported = [{"id": "review-a", "v": 2}, {"id": "review-b", "v": 1}]
    merged, added, updated = export.merge_cases(existing, exported)
    assert merged == [{"id": "seed", "v": 1}, {"id": "review-a", "v": 2}, {"id": "review-b", "v": 1}]
    assert (added, updated) == (1, 1)


def test_merge_is_idempotent():
    cases = [{"id": "a", "v": 1}]
    merged, added, updated = export.merge_cases(cases, cases)
    assert (merged, added, updated) == (cases, 0, 0)


def test_main_from_file(tmp_path, capsys):
    dataset = tmp_path / "ds.json"
    dataset.write_text(json.dumps({"cases": [{"id": "seed"}]}))
    source = tmp_path / "export.json"
    source.write_text(json.dumps({"cases": [{"id": "review-1"}]}))
    assert export.main(["--from-file", str(source), "--dataset", str(dataset)]) == 0
    assert json.loads(dataset.read_text()) == {"cases": [{"id": "seed"}, {"id": "review-1"}]}
    assert "1 added, 0 updated, 2 total" in capsys.readouterr().out


def test_main_creates_the_dataset_if_missing(tmp_path):
    source = tmp_path / "export.json"
    source.write_text(json.dumps({"cases": [{"id": "review-1"}]}))
    dataset = tmp_path / "new.json"
    export.main(["--from-file", str(source), "--dataset", str(dataset)])
    assert json.loads(dataset.read_text())["cases"] == [{"id": "review-1"}]


def test_main_fetches_from_the_api_with_the_token(tmp_path, monkeypatch):
    calls = []

    class _Res:
        def raise_for_status(self):
            pass

        def json(self):
            return {"cases": [{"id": "review-x"}]}

    def fake_get(url, headers, timeout):
        calls.append((url, headers))
        return _Res()

    monkeypatch.setattr(export.httpx, "get", fake_get)
    dataset = tmp_path / "ds.json"
    export.main(["--base-url", "https://tf.example/", "--token", "tok", "--dataset", str(dataset)])
    assert calls == [("https://tf.example/api/ai-reviews/export", {"Authorization": "Bearer tok"})]
    assert json.loads(dataset.read_text())["cases"] == [{"id": "review-x"}]


def test_main_requires_a_token_with_base_url(tmp_path):
    with pytest.raises(SystemExit):
        export.main(["--base-url", "https://tf.example", "--dataset", str(tmp_path / "d.json")])
