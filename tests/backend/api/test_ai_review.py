"""Human review of AI drafts (course milestone M9, api/ai_review.py):
generate -> save as drafts -> accept / edit / reject-with-reason -> export
as eval cases, and rejections feeding the next generation prompt."""
import pytest

from tests.api.test_ai_generate import VALID_RESPONSE, _FakeMessages, _install_fake_anthropic


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Review Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Checkout"}, headers=headers).json()
    return s, headers, client


@pytest.fixture()
def drafts(suite, monkeypatch):
    """Two AI drafts generated and saved through the real endpoints.
    Returns (suite, headers, client, generation, reviews)."""
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)
    generation = client.post(f"/api/suites/{s['id']}/testcases/generate",
                             json={"feature_description": "Login flow", "count": 2}, headers=headers).json()
    saved = client.post(f"/api/suites/{s['id']}/testcases/generate/save",
                        params={"generation_id": generation["generation_id"]},
                        json=generation["test_cases"], headers=headers).json()
    assert saved["saved"] == 2 and len(saved["review_ids"]) == 2
    reviews = client.get(f"/api/suites/{s['id']}/ai-reviews", headers=headers).json()
    return s, headers, client, generation, reviews


def _review(client, headers, review_id, **decision):
    return client.post(f"/api/ai-reviews/{review_id}", json=decision, headers=headers)


def _testcase(client, headers, suite_id, tc_id):
    return next((tc for tc in client.get(f"/api/suites/{suite_id}/testcases", headers=headers).json()
                 if tc["id"] == tc_id), None)


# ─── Saving drafts creates pending reviews ──────────────────────────────────

def test_generate_returns_a_generation_id(drafts):
    _, _, _, generation, _ = drafts
    assert len(generation["generation_id"]) == 32


def test_saved_drafts_get_pending_reviews_with_their_generation(drafts):
    s, headers, client, generation, reviews = drafts
    assert [r["verdict"] for r in reviews] == ["pending", "pending"]
    first = reviews[0]
    assert first["generation_id"] == generation["generation_id"]
    assert first["feature_description"] == "Login flow"
    assert first["model"] == "claude-haiku-4-5-20251001"
    assert first["original"]["title"] == "Login with valid credentials"
    assert first["edited"] is None
    assert _testcase(client, headers, s["id"], first["test_case_id"])["status"] == "draft"


def test_save_without_generation_id_still_creates_reviews(suite):
    """Older clients don't send generation_id: drafts are reviewable, just
    not exportable (the prompt inputs are unknown)."""
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases/generate/save",
                json=[{"title": "Manual draft", "priority": "low"}], headers=headers)
    [review] = client.get(f"/api/suites/{s['id']}/ai-reviews", headers=headers).json()
    assert review["generation_id"] is None and review["feature_description"] is None


def test_save_ignores_a_generation_id_from_another_suite(drafts, auth_client):
    s, headers, client, generation, _ = drafts
    p = client.post("/api/projects", json={"name": "Other"}, headers=headers).json()
    other = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Other"}, headers=headers).json()
    client.post(f"/api/suites/{other['id']}/testcases/generate/save",
                params={"generation_id": generation["generation_id"]},
                json=[{"title": "x"}], headers=headers)
    [review] = client.get(f"/api/suites/{other['id']}/ai-reviews", headers=headers).json()
    assert review["generation_id"] is None


def test_list_filters_by_verdict_and_404s_for_unknown_suite(drafts):
    s, headers, client, _, reviews = drafts
    _review(client, headers, reviews[0]["id"], verdict="accepted")
    pending = client.get(f"/api/suites/{s['id']}/ai-reviews", params={"verdict": "pending"}, headers=headers).json()
    assert [r["id"] for r in pending] == [reviews[1]["id"]]
    assert client.get(f"/api/suites/{s['id']}/ai-reviews", params={"verdict": "maybe"}, headers=headers).status_code == 422
    assert client.get("/api/suites/99999/ai-reviews", headers=headers).status_code == 404


def test_listing_requires_authentication(drafts):
    s, _, client, _, _ = drafts
    assert client.get(f"/api/suites/{s['id']}/ai-reviews").status_code == 401


# ─── Verdicts ────────────────────────────────────────────────────────────────

def test_accept_activates_the_test_case(drafts):
    s, headers, client, _, reviews = drafts
    r = _review(client, headers, reviews[0]["id"], verdict="accepted")
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "accepted"
    assert body["reviewed_by_username"] == "testuser"
    assert body["reviewed_at"].endswith("+00:00")
    assert _testcase(client, headers, s["id"], reviews[0]["test_case_id"])["status"] == "active"


def test_edit_applies_changes_and_keeps_before_and_after(drafts):
    s, headers, client, _, reviews = drafts
    r = _review(client, headers, reviews[1]["id"], verdict="edited",
                edits={"title": "Login rejects a wrong password", "priority": "high"})
    assert r.status_code == 200
    body = r.json()
    assert body["original"]["title"] == "Login with invalid password"
    assert body["edited"]["title"] == "Login rejects a wrong password"
    assert body["edited"]["priority"] == "high"
    assert body["edited"]["steps"] == body["original"]["steps"]  # untouched fields kept
    tc = _testcase(client, headers, s["id"], reviews[1]["test_case_id"])
    assert (tc["title"], tc["priority"], tc["status"]) == ("Login rejects a wrong password", "high", "active")


def test_reject_removes_the_draft_and_keeps_the_reason(drafts):
    s, headers, client, _, reviews = drafts
    r = _review(client, headers, reviews[0]["id"], verdict="rejected", reason="  Duplicates TC-12  ")
    assert r.status_code == 200
    body = r.json()
    assert (body["verdict"], body["reason"], body["test_case_id"]) == ("rejected", "Duplicates TC-12", None)
    assert _testcase(client, headers, s["id"], reviews[0]["test_case_id"]) is None


def test_reject_also_drops_the_drafts_retrieval_embedding(drafts):
    from api import models
    from tests.api.conftest import TestingSessionLocal

    _, headers, client, _, reviews = drafts
    tc_id = reviews[0]["test_case_id"]
    db = TestingSessionLocal()
    assert db.query(models.TestCaseEmbedding).filter_by(test_case_id=tc_id).count() == 1
    _review(client, headers, reviews[0]["id"], verdict="rejected", reason="Out of scope")
    assert db.query(models.TestCaseEmbedding).filter_by(test_case_id=tc_id).count() == 0
    db.close()


@pytest.mark.parametrize("decision", [
    {"verdict": "rejected"},
    {"verdict": "rejected", "reason": "   "},
    {"verdict": "edited"},
    {"verdict": "edited", "edits": {}},
    {"verdict": "edited", "edits": {"priority": "urgent"}},
    {"verdict": "edited", "edits": {"title": ""}},
    {"verdict": "maybe"},
])
def test_invalid_decisions_are_422(drafts, decision):
    _, headers, client, _, reviews = drafts
    assert _review(client, headers, reviews[0]["id"], **decision).status_code == 422


def test_a_draft_can_only_be_reviewed_once(drafts):
    _, headers, client, _, reviews = drafts
    _review(client, headers, reviews[0]["id"], verdict="accepted")
    r = _review(client, headers, reviews[0]["id"], verdict="rejected", reason="changed my mind")
    assert r.status_code == 409


def test_a_deleted_draft_can_only_be_rejected(drafts):
    _, headers, client, _, reviews = drafts
    client.delete(f"/api/testcases/{reviews[0]['test_case_id']}", headers=headers)
    assert _review(client, headers, reviews[0]["id"], verdict="accepted").status_code == 409
    assert _review(client, headers, reviews[0]["id"], verdict="rejected", reason="gone").status_code == 200


def test_unknown_review_is_404(auth_client):
    client, headers = auth_client
    assert _review(client, headers, 99999, verdict="accepted").status_code == 404


def test_reviewing_requires_admin(drafts, executor_client):
    _, _, _, _, reviews = drafts
    exec_client, exec_headers = executor_client
    assert _review(exec_client, exec_headers, reviews[0]["id"], verdict="accepted").status_code == 403


# ─── Feedback into the next generation prompt ────────────────────────────────

def test_rejections_are_fed_into_the_next_generation_prompt(drafts, monkeypatch):
    s, headers, client, _, reviews = drafts
    _review(client, headers, reviews[0]["id"], verdict="rejected", reason="Covered by the SSO suite")
    _review(client, headers, reviews[1]["id"], verdict="accepted")

    client.post(f"/api/suites/{s['id']}/testcases/generate",
                json={"feature_description": "Login flow", "count": 2}, headers=headers)
    prompt = _FakeMessages.last_call_kwargs["messages"][0]["content"]
    assert "Reviewers rejected these earlier drafts" in prompt
    assert "- Login with valid credentials: Covered by the SSO suite" in prompt
    assert "Login with invalid password" not in prompt  # accepted drafts aren't "rejections"


def test_first_generation_prompt_has_no_reviewer_block(suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)
    client.post(f"/api/suites/{s['id']}/testcases/generate",
                json={"feature_description": "Login flow", "count": 2, "grounded": True}, headers=headers)
    assert "Reviewers rejected" not in _FakeMessages.last_call_kwargs["messages"][0]["content"]


def test_rejections_from_other_suites_are_not_used(drafts, monkeypatch):
    s, headers, client, _, reviews = drafts
    _review(client, headers, reviews[0]["id"], verdict="rejected", reason="Out of scope")
    p = client.post("/api/projects", json={"name": "P2"}, headers=headers).json()
    other = client.post(f"/api/projects/{p['id']}/suites", json={"name": "S2"}, headers=headers).json()
    client.post(f"/api/suites/{other['id']}/testcases/generate",
                json={"feature_description": "Login flow", "count": 2}, headers=headers)
    assert "Reviewers rejected" not in _FakeMessages.last_call_kwargs["messages"][0]["content"]


# ─── Export as eval cases ────────────────────────────────────────────────────

def test_export_turns_reviewed_drafts_into_eval_cases(drafts):
    _, headers, client, generation, reviews = drafts
    assert client.get("/api/ai-reviews/export", headers=headers).json() == {"cases": []}  # all pending

    _review(client, headers, reviews[0]["id"], verdict="rejected", reason="Duplicates TC-12")
    _review(client, headers, reviews[1]["id"], verdict="edited", edits={"title": "Wrong password is rejected"})

    [case] = client.get("/api/ai-reviews/export", headers=headers).json()["cases"]
    assert case["id"] == f"review-{generation['generation_id'][:8]}"
    assert case["source"] == "human_review"
    assert (case["suite_name"], case["feature_description"], case["count"]) == ("Checkout", "Login flow", 2)
    assert case["model"] == "claude-haiku-4-5-20251001"
    assert len(case["prompt_version"]) == 8
    assert case["rejected"] == [{"title": "Login with valid credentials", "reason": "Duplicates TC-12"}]
    assert case["accepted_titles"] == ["Wrong password is rejected"]
    [edit] = case["edits"]
    assert edit["before"]["title"] == "Login with invalid password"
    assert edit["changed"] == ["title"]


def test_export_skips_drafts_without_a_generation(suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases/generate/save", json=[{"title": "x"}], headers=headers)
    [review] = client.get(f"/api/suites/{s['id']}/ai-reviews", headers=headers).json()
    _review(client, headers, review["id"], verdict="rejected", reason="noise")
    assert client.get("/api/ai-reviews/export", headers=headers).json() == {"cases": []}


def test_export_requires_admin(executor_client):
    exec_client, exec_headers = executor_client
    assert exec_client.get("/api/ai-reviews/export", headers=exec_headers).status_code == 403


def test_reviews_survive_suite_deletion(drafts):
    """The human judgement outlives the suite: it's eval data now."""
    s, headers, client, _, reviews = drafts
    _review(client, headers, reviews[0]["id"], verdict="rejected", reason="Out of scope")
    client.delete(f"/api/suites/{s['id']}", headers=headers)
    [case] = client.get("/api/ai-reviews/export", headers=headers).json()["cases"]
    assert case["rejected"][0]["reason"] == "Out of scope"
