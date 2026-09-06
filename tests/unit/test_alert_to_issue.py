"""Unit tests for scripts/alert_to_issue/main.py — Pub/Sub payload parsing
and issue title/body building (pure), the dedup lookup and open/close
logic against a mocked HTTP transport (httpx.MockTransport). No real
Pub/Sub message, no real GitHub API calls, no functions-framework needed
(deliberately not imported by this test — see main.py's module docstring
for why it can't be a repo test dependency).
"""
import base64
import json

import httpx
import pytest

from scripts.alert_to_issue.main import (
    build_issue_body,
    build_issue_title,
    find_existing_issue,
    handle_incident,
    parse_incident,
)

OPEN_INCIDENT = {
    "incident_id": "0.abc123",
    "policy_name": "Cloud Run 5xx spike",
    "condition_name": "5xx request rate above threshold",
    "state": "open",
    "summary": "5xx requests exceeded threshold",
    "started_at": "2026-01-01T00:00:00Z",
    "url": "https://console.cloud.google.com/incident/0.abc123",
}

CLOSED_INCIDENT = {**OPEN_INCIDENT, "state": "closed"}


def test_parse_incident_decodes_base64_pubsub_payload():
    raw = json.dumps({"incident": OPEN_INCIDENT, "version": "1.2"})
    encoded = base64.b64encode(raw.encode()).decode()
    assert parse_incident(encoded) == OPEN_INCIDENT


def test_build_issue_title_includes_policy_name():
    assert build_issue_title(OPEN_INCIDENT) == "[GCP Alert] Cloud Run 5xx spike"


def test_build_issue_title_handles_missing_policy_name():
    assert build_issue_title({}) == "[GCP Alert] Unknown policy"


def test_build_issue_body_includes_incident_id_marker_for_dedup():
    body = build_issue_body(OPEN_INCIDENT)
    assert "<!-- alert-to-issue incident_id=0.abc123 -->" in body
    assert "5xx requests exceeded threshold" in body
    assert OPEN_INCIDENT["url"] in body


def test_find_existing_issue_returns_none_when_search_is_empty():
    def handler(request):
        assert 'in:body "incident_id=0.abc123"' in request.url.params["q"]
        return httpx.Response(200, json={"items": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert find_existing_issue(client, "owner/repo", "tok", "0.abc123") is None


def test_find_existing_issue_returns_first_match():
    def handler(request):
        return httpx.Response(200, json={"items": [{"number": 7, "html_url": "https://github.com/owner/repo/issues/7"}]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        issue = find_existing_issue(client, "owner/repo", "tok", "0.abc123")
    assert issue["number"] == 7


def test_handle_incident_opens_a_new_issue_when_none_exists():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url)))
        if request.method == "GET":
            return httpx.Response(200, json={"items": []})
        payload = json.loads(request.content)
        assert payload["labels"] == ["gcp-alert"]
        return httpx.Response(201, json={"html_url": "https://github.com/owner/repo/issues/9"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = handle_incident(client, "owner/repo", "tok", OPEN_INCIDENT)

    assert url == "https://github.com/owner/repo/issues/9"
    assert any(m == "POST" and u.endswith("/repos/owner/repo/issues") for m, u in calls)


def test_handle_incident_does_not_duplicate_an_already_tracked_open_incident():
    calls = []

    def handler(request):
        calls.append(request.method)
        if request.method == "GET":
            return httpx.Response(200, json={"items": [{"number": 7, "html_url": "https://github.com/owner/repo/issues/7"}]})
        raise AssertionError("should not create or modify an issue for an already-tracked open incident")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = handle_incident(client, "owner/repo", "tok", OPEN_INCIDENT)

    assert url == "https://github.com/owner/repo/issues/7"
    assert calls == ["GET"]


def test_handle_incident_closes_and_comments_the_matching_issue():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url)))
        if request.method == "GET":
            return httpx.Response(200, json={"items": [{"number": 7, "html_url": "https://github.com/owner/repo/issues/7"}]})
        if request.method == "POST":
            assert request.url.path.endswith("/issues/7/comments")
            return httpx.Response(201, json={"id": 1})
        assert request.method == "PATCH"
        payload = json.loads(request.content)
        assert payload["state"] == "closed"
        return httpx.Response(200, json={"id": 7})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = handle_incident(client, "owner/repo", "tok", CLOSED_INCIDENT)

    assert url == "https://github.com/owner/repo/issues/7"
    assert any(m == "PATCH" for m, _ in calls)


def test_handle_incident_closing_with_no_matching_issue_is_a_safe_no_op():
    def handler(request):
        assert request.method == "GET"
        return httpx.Response(200, json={"items": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = handle_incident(client, "owner/repo", "tok", CLOSED_INCIDENT)

    assert url == ""


def test_handle_incident_raises_on_http_error_when_creating():
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"items": []})
        return httpx.Response(403, json={"message": "forbidden"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            handle_incident(client, "owner/repo", "tok", OPEN_INCIDENT)
