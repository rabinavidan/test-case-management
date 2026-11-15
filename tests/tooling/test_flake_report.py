"""Unit tests for scripts/flake_report.py — flaky-test detection from a
pytest-json-report payload, and the GitHub issue file-or-update logic
against a mocked HTTP transport (httpx.MockTransport). No real network
calls, no real GitHub API access.
"""
import json

import httpx
import pytest

from scripts.flake_report import (
    build_flake_issue_body,
    file_or_update_flake_issue,
    find_existing_issue,
    find_flaky_tests,
)


def test_find_flaky_tests_returns_only_rerun_outcomes_sorted():
    report = {
        "tests": [
            {"nodeid": "tests/b.py::test_b", "outcome": "rerun"},
            {"nodeid": "tests/a.py::test_a", "outcome": "passed"},
            {"nodeid": "tests/c.py::test_c", "outcome": "failed"},
            {"nodeid": "tests/aa.py::test_aa", "outcome": "rerun"},
        ]
    }
    assert find_flaky_tests(report) == ["tests/aa.py::test_aa", "tests/b.py::test_b"]


def test_find_flaky_tests_empty_when_no_reruns():
    report = {"tests": [{"nodeid": "tests/a.py::test_a", "outcome": "passed"}]}
    assert find_flaky_tests(report) == []


def test_find_flaky_tests_handles_missing_tests_key():
    assert find_flaky_tests({}) == []


def test_build_flake_issue_body_lists_every_flaky_test_and_the_run_url():
    body = build_flake_issue_body(["tests/a.py::test_a", "tests/b.py::test_b"], "https://github.com/x/y/actions/runs/1")
    assert "tests/a.py::test_a" in body
    assert "tests/b.py::test_b" in body
    assert "https://github.com/x/y/actions/runs/1" in body
    assert ".claude/skills/steward/SKILL.md" in body


def test_build_flake_issue_body_handles_missing_run_url():
    body = build_flake_issue_body(["tests/a.py::test_a"], "")
    assert "no run URL provided" in body


def test_find_existing_issue_returns_none_when_search_is_empty():
    def handler(request):
        assert request.url.path == "/search/issues"
        return httpx.Response(200, json={"items": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert find_existing_issue(client, "owner/repo", "tok") is None


def test_find_existing_issue_returns_first_match():
    def handler(request):
        return httpx.Response(200, json={"items": [{"number": 42, "html_url": "https://github.com/owner/repo/issues/42"}]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        issue = find_existing_issue(client, "owner/repo", "tok")
    assert issue["number"] == 42


def test_file_or_update_flake_issue_creates_when_none_exists():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/search/issues":
            return httpx.Response(200, json={"items": []})
        assert request.method == "POST"
        assert request.url.path == "/repos/owner/repo/issues"
        payload = json.loads(request.content)
        assert payload["title"] == "CI: flaky tests detected"
        assert payload["labels"] == ["flaky-test"]
        return httpx.Response(201, json={"html_url": "https://github.com/owner/repo/issues/7"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = file_or_update_flake_issue(client, "owner/repo", "tok", ["tests/a.py::test_a"], "https://run")

    assert url == "https://github.com/owner/repo/issues/7"
    assert ("POST", "/repos/owner/repo/issues") in calls


def test_file_or_update_flake_issue_comments_when_one_already_exists():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/search/issues":
            return httpx.Response(200, json={"items": [{"number": 42, "html_url": "https://github.com/owner/repo/issues/42"}]})
        assert request.method == "POST"
        assert request.url.path == "/repos/owner/repo/issues/42/comments"
        return httpx.Response(201, json={"id": 1})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = file_or_update_flake_issue(client, "owner/repo", "tok", ["tests/a.py::test_a"], "https://run")

    assert url == "https://github.com/owner/repo/issues/42"
    assert ("POST", "/repos/owner/repo/issues/42/comments") in calls
    # Never tried to create a second issue.
    assert ("POST", "/repos/owner/repo/issues") not in calls


def test_file_or_update_flake_issue_raises_on_http_error():
    def handler(request):
        if request.url.path == "/search/issues":
            return httpx.Response(200, json={"items": []})
        return httpx.Response(403, json={"message": "not allowed"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            file_or_update_flake_issue(client, "owner/repo", "tok", ["tests/a.py::test_a"], "https://run")
