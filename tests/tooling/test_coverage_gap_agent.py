"""Unit tests for scripts/coverage_gap_agent.py — the changed-file/gap
heuristic (pure), prompt/comment building (pure), and the Gemini + GitHub
API calls against a mocked HTTP transport (httpx.MockTransport). No real
git subprocess calls (mocked), no real network calls, no real API keys.
"""
import json

import httpx
import pytest

from scripts.coverage_gap_agent import (
    build_gemini_prompt,
    build_pr_comment,
    call_gemini,
    changed_files,
    find_existing_comment,
    find_likely_gaps,
    post_or_update_comment,
)


def test_changed_files_parses_git_diff_output(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)

        class Result:
            stdout = "api/main.py\nservices/auth/main.py\n\n"

        return Result()

    monkeypatch.setattr("subprocess.run", fake_run)
    files = changed_files("base_sha", "head_sha")

    assert files == ["api/main.py", "services/auth/main.py"]
    assert calls[0][:3] == ["git", "diff", "--name-only"]
    assert calls[0][3] == "base_sha...head_sha"


def test_find_likely_gaps_flags_api_change_with_no_matching_test():
    changed = ["api/main.py", "docs/README.md"]
    assert find_likely_gaps(changed) == ["api/main.py"]


def test_find_likely_gaps_clears_api_change_when_a_matching_test_changed():
    changed = ["api/main.py", "tests/api/test_something.py"]
    assert find_likely_gaps(changed) == []


def test_find_likely_gaps_treats_contract_tests_as_covering_api_and_services():
    assert find_likely_gaps(["api/main.py", "tests/contract/test_openapi_contract.py"]) == []
    assert find_likely_gaps(["services/auth/main.py", "tests/contract/test_openapi_contract.py"]) == []


def test_find_likely_gaps_does_not_cross_layers():
    # An api/ change is not "covered" by a services/ test touching a
    # different layer's test directory.
    assert find_likely_gaps(["api/main.py", "tests/services/test_auth_service.py"]) == ["api/main.py"]


def test_find_likely_gaps_ignores_non_source_files():
    assert find_likely_gaps(["README.md", "terraform/main.tf"]) == []


def test_find_likely_gaps_flags_each_source_file_independently():
    changed = ["api/main.py", "services/runs/main.py", "tests/unit/test_something.py"]
    # tests/unit/ covers both prefixes per TEST_LAYER_PREFIXES, so neither is flagged.
    assert find_likely_gaps(changed) == []


def test_build_gemini_prompt_includes_file_path_and_diff():
    prompt = build_gemini_prompt("api/main.py", "+def new_route(): ...")
    assert "api/main.py" in prompt
    assert "+def new_route(): ..." in prompt


def test_build_pr_comment_includes_marker_and_every_suggestion():
    body = build_pr_comment({"api/main.py": "- test the new route returns 201"})
    assert "<!-- coverage-gap-agent -->" in body
    assert "api/main.py" in body
    assert "test the new route returns 201" in body


def test_call_gemini_extracts_text_from_response():
    def handler(request):
        assert request.url.params["key"] == "fake-key"
        payload = json.loads(request.content)
        assert payload["contents"][0]["parts"][0]["text"] == "prompt text"
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "  - do X  "}]}}]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = call_gemini(client, "fake-key", "prompt text")
    assert result == "- do X"


def test_find_existing_comment_returns_none_when_marker_absent():
    def handler(request):
        return httpx.Response(200, json=[{"id": 1, "body": "unrelated comment"}])

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert find_existing_comment(client, "owner/repo", "5", "tok") is None


def test_find_existing_comment_finds_marked_comment():
    def handler(request):
        return httpx.Response(200, json=[
            {"id": 1, "body": "unrelated"},
            {"id": 2, "body": "<!-- coverage-gap-agent -->\nold suggestions"},
        ])

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        comment = find_existing_comment(client, "owner/repo", "5", "tok")
    assert comment["id"] == 2


def test_post_or_update_comment_creates_when_none_exists():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url)))
        if request.method == "GET":
            return httpx.Response(200, json=[])
        return httpx.Response(201, json={"html_url": "https://github.com/owner/repo/pull/5#issuecomment-1"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = post_or_update_comment(client, "owner/repo", "5", "tok", "body")

    assert url == "https://github.com/owner/repo/pull/5#issuecomment-1"
    assert any(m == "POST" and u.endswith("/repos/owner/repo/issues/5/comments") for m, u in calls)


def test_post_or_update_comment_patches_when_one_exists():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url)))
        if request.method == "GET":
            return httpx.Response(200, json=[{"id": 9, "body": "<!-- coverage-gap-agent -->\nold"}])
        assert request.method == "PATCH"
        return httpx.Response(200, json={"html_url": "https://github.com/owner/repo/pull/5#issuecomment-9"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        url = post_or_update_comment(client, "owner/repo", "5", "tok", "new body")

    assert url == "https://github.com/owner/repo/pull/5#issuecomment-9"
    assert not any(m == "POST" for m, _ in calls)


def test_post_or_update_comment_raises_on_http_error():
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[])
        return httpx.Response(403, json={"message": "forbidden"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            post_or_update_comment(client, "owner/repo", "5", "tok", "body")
