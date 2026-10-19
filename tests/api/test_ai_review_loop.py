"""Course milestone M9's "done when": a rejection in the UI shows up as a
failing-then-fixed eval case. Walks the whole loop through the real code:

  reviewer rejects a draft (API)
  -> GET /api/ai-reviews/export
  -> scripts/export_review_dataset.py writes the eval dataset
  -> the eval harness runs it: without the reviewer feedback in the prompt the
     model repeats the rejected draft and the case FAILS its gate; with the
     production prompt (feedback included) the same model avoids it and PASSES.

The model is a scripted stand-in with exactly the behaviour the loop exists
to correct — it repeats a draft unless the prompt tells it a reviewer
rejected it — so the test pins the plumbing, not a model's quality.
"""
import json

from evals.harness import run_suite
from evals.targets import TARGETS
from scripts import export_review_dataset as export
from tests.api.test_ai_generate import VALID_RESPONSE, _install_fake_anthropic


class _ModelThatRepeatsItself:
    """Always proposes the same drafts the live endpoint produced, unless the
    prompt lists one of them as reviewer-rejected — then it swaps it out."""

    def __init__(self, drafts):
        self.drafts = drafts

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        titles = []
        for title in self.drafts:
            if f"- {title}:" in user_prompt:
                title = "Wrong password shows an error and keeps the user logged out"
            titles.append(title)
        return json.dumps({"test_cases": [
            {"title": t, "description": "d", "steps": "s", "expected_result": "e", "priority": "medium"}
            for t in titles
        ]})


def test_a_rejection_becomes_a_failing_then_fixed_eval_case(auth_client, monkeypatch, tmp_path):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Loop"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Authentication"}, headers=headers).json()

    # 1. AI drafts, saved for review.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)
    gen = client.post(f"/api/suites/{s['id']}/testcases/generate",
                      json={"feature_description": "Login flow", "count": 2}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases/generate/save",
                params={"generation_id": gen["generation_id"]}, json=gen["test_cases"], headers=headers)
    reviews = client.get(f"/api/suites/{s['id']}/ai-reviews", headers=headers).json()

    # 2. A reviewer accepts one draft and rejects the other, with a reason.
    client.post(f"/api/ai-reviews/{reviews[0]['id']}", json={"verdict": "accepted"}, headers=headers)
    client.post(f"/api/ai-reviews/{reviews[1]['id']}",
                json={"verdict": "rejected", "reason": "Duplicates TC-AUTH-3"}, headers=headers)

    # 3. Export -> eval dataset.
    export_file = tmp_path / "export.json"
    export_file.write_text(json.dumps(client.get("/api/ai-reviews/export", headers=headers).json()))
    dataset = tmp_path / "reviewed.json"
    export.main(["--from-file", str(export_file), "--dataset", str(dataset)])
    [case] = json.loads(dataset.read_text())["cases"]
    assert case["rejected"] == [{"title": "Login with invalid password", "reason": "Duplicates TC-AUTH-3"}]

    # 4. Same model, before and after the prompt change.
    model = _ModelThatRepeatsItself([tc["title"] for tc in gen["test_cases"]])
    results = {}
    for name in ("test_generation_reviewed_no_feedback", "test_generation_reviewed"):
        target = TARGETS[name]
        report = run_suite(dataset, model, target.TARGET, n_runs=2)
        results[name] = (
            report.cases[0].mean_scores["rejected_repeat_rate"],
            report.overall_pass(target.DEFAULT_MIN_THRESHOLDS, target.DEFAULT_MAX_THRESHOLDS,
                                target.DEFAULT_MAX_ERROR_RATE),
        )

    assert results["test_generation_reviewed_no_feedback"] == (0.5, False)  # failing: repeats the rejection
    assert results["test_generation_reviewed"] == (0.0, True)               # fixed: feedback in the prompt
