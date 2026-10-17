"""Human review of AI drafts (course milestone M9): the review endpoint saves
accepted and edited drafts, records every verdict, and a rejection exported
by evals/export_reviews.py becomes an eval case that fails on the rejected
output and passes once the output covers what the reviewer asked for."""
import json

import pytest

from evals.export_reviews import reviews_to_dataset
from evals.targets import test_generation

DRAFT = {"title": "Login with valid credentials", "description": "Happy path", "steps": "Enter user and password",
         "expected_result": "Dashboard loads", "priority": "high"}


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    pid = client.post("/api/projects", json={"name": "Review Proj"}, headers=headers).json()["id"]
    return client.post(f"/api/projects/{pid}/suites", json={"name": "Auth"}, headers=headers).json()["id"], pid


def _review(client, headers, suite_id, decisions, feature="User login, including lockout after failed attempts"):
    return client.post(f"/api/suites/{suite_id}/testcases/generate/review", headers=headers,
                       json={"feature_description": feature, "model": "claude-haiku-4-5", "decisions": decisions})


def test_accepted_and_edited_drafts_are_saved_and_rejected_ones_are_not(auth_client, suite):
    client, headers = auth_client
    sid, _ = suite
    edited = {**DRAFT, "title": "Login with valid credentials (case-insensitive username)"}
    r = _review(client, headers, sid, [
        {"output": DRAFT, "verdict": "accepted"},
        {"output": {**DRAFT, "title": "Login typo"}, "verdict": "edited", "edited": edited},
        {"output": {**DRAFT, "title": "Login works"}, "verdict": "rejected", "reason": "Duplicate of the first",
         "must_cover": ["lockout"]},
    ])
    assert r.status_code == 200, r.text
    assert r.json()["saved"] == 2 and r.json()["rejected"] == 1

    cases = client.get(f"/api/suites/{sid}/testcases", headers=headers).json()
    assert sorted(c["title"] for c in cases) == sorted([DRAFT["title"], edited["title"]])
    assert all(c["status"] == "draft" for c in cases)

    reviews = {x["verdict"]: x for x in client.get("/api/ai/reviews", headers=headers).json()}
    assert reviews["accepted"]["test_case_id"] is not None
    assert reviews["edited"]["output"]["title"] == "Login typo"
    assert reviews["edited"]["edited"]["title"] == edited["title"]
    assert reviews["rejected"]["test_case_id"] is None
    assert reviews["rejected"]["reason"] == "Duplicate of the first"
    assert reviews["rejected"]["must_cover"] == ["lockout"]
    for x in reviews.values():
        assert x["reviewer"] == "testuser"
        assert x["batch_size"] == 3
        assert x["suite_name"] == "Auth"
        assert x["model"] == "claude-haiku-4-5"


@pytest.mark.parametrize("decision,why", [
    ({"output": DRAFT, "verdict": "rejected"}, "a rejection needs a reason"),
    ({"output": DRAFT, "verdict": "rejected", "reason": "   "}, "a rejection needs a reason"),
    ({"output": DRAFT, "verdict": "edited"}, "an edit needs the edited test case"),
    ({"output": DRAFT, "verdict": "maybe"}, "verdict"),
])
def test_incomplete_decisions_are_rejected(auth_client, suite, decision, why):
    client, headers = auth_client
    r = _review(client, headers, suite[0], [decision])
    assert r.status_code == 422
    assert why in json.dumps(r.json())


def test_an_empty_review_is_rejected(auth_client, suite):
    client, headers = auth_client
    assert _review(client, headers, suite[0], []).status_code == 422


def test_reviewing_needs_an_admin_and_an_existing_suite(client, auth_client, executor_client, suite):
    _, exec_headers = executor_client
    _, headers = auth_client
    assert _review(client, exec_headers, suite[0], [{"output": DRAFT, "verdict": "accepted"}]).status_code == 403
    assert _review(client, {}, suite[0], [{"output": DRAFT, "verdict": "accepted"}]).status_code == 401
    assert _review(client, headers, 9999, [{"output": DRAFT, "verdict": "accepted"}]).status_code == 404
    assert client.get("/api/ai/reviews", headers=exec_headers).status_code == 403


def test_reviews_filter_by_verdict_and_suite_and_outlive_their_project(auth_client, suite):
    client, headers = auth_client
    sid, pid = suite
    _review(client, headers, sid, [{"output": DRAFT, "verdict": "accepted"},
                                   {"output": DRAFT, "verdict": "rejected", "reason": "vague"}])
    assert [x["verdict"] for x in client.get("/api/ai/reviews?verdict=rejected", headers=headers).json()] == ["rejected"]
    assert len(client.get(f"/api/ai/reviews?suite_id={sid}", headers=headers).json()) == 2
    assert client.get("/api/ai/reviews?verdict=maybe", headers=headers).status_code == 422

    assert client.delete(f"/api/projects/{pid}", headers=headers).status_code == 204
    # A review log, not part of the suite: the eval data survives the cleanup.
    assert len(client.get("/api/ai/reviews", headers=headers).json()) == 2


def test_a_rejection_becomes_an_eval_case_that_fails_then_passes_once_fixed(auth_client, suite):
    """The M9 loop: human judgement -> eval dataset -> prompt change -> regression check."""
    client, headers = auth_client
    rejected_output = {**DRAFT, "title": "Login works", "description": "User can log in"}
    _review(client, headers, suite[0], [
        {"output": rejected_output, "verdict": "rejected",
         "reason": "Ignores the lockout and wrong-password cases the feature calls for",
         "must_cover": ["lockout", "wrong password"]},
    ])

    dataset = reviews_to_dataset(client.get("/api/ai/reviews", headers=headers).json())
    [case] = dataset["cases"]
    assert case["required_keywords"] == ["lockout", "wrong password"]
    assert case["feature_description"] == "User login, including lockout after failed attempts"
    assert case["human_review"]["rejected_output"] == rejected_output

    gate = test_generation.DEFAULT_MIN_THRESHOLDS["keyword_coverage_score"]
    as_model_reply = lambda tcs: json.dumps({"test_cases": tcs})  # noqa: E731

    # The output the reviewer rejected fails its own eval case...
    before = test_generation.TARGET.score(as_model_reply([rejected_output]), case)
    assert before["keyword_coverage_score"] < gate

    # ...and output from a prompt that now covers those scenarios passes it.
    fixed = [
        {**DRAFT, "title": "Account lockout after five failed attempts", "description": "Lockout engages"},
        {**DRAFT, "title": "Wrong password shows an error", "description": "Wrong password rejected"},
    ]
    after = test_generation.TARGET.score(as_model_reply(fixed), case)
    assert after["keyword_coverage_score"] == 1.0
