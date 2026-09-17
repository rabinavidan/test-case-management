import json

import anthropic
import pytest


class _FakeContentBlock:
    def __init__(self, text):
        self.text = text


class _FakeMessage:
    def __init__(self, text, model="claude-haiku-4-5-20251001"):
        self.content = [_FakeContentBlock(text)]
        self.model = model


class _FakeMessages:
    last_call_kwargs = None

    def __init__(self, response_text=None, raise_exc=None):
        self._response_text = response_text
        self._raise_exc = raise_exc

    def create(self, **kwargs):
        _FakeMessages.last_call_kwargs = kwargs
        if self._raise_exc:
            raise self._raise_exc
        return _FakeMessage(self._response_text)


class _FakeAnthropic:
    """Stand-in for anthropic.Anthropic so tests never hit the real API."""

    response_text = None
    raise_exc = None

    def __init__(self, api_key=None):
        self.messages = _FakeMessages(self.response_text, self.raise_exc)


def _install_fake_anthropic(monkeypatch, response_text=None, raise_exc=None):
    fake_cls = type("_FakeAnthropic", (_FakeAnthropic,), {
        "response_text": response_text,
        "raise_exc": raise_exc,
    })
    monkeypatch.setattr(anthropic, "Anthropic", fake_cls)


VALID_RESPONSE = json.dumps({
    "test_cases": [
        {
            "title": "Login with valid credentials",
            "description": "Verify login succeeds",
            "steps": "1. Enter credentials\n2. Submit",
            "expected_result": "User is logged in",
            "priority": "high",
        },
        {
            "title": "Login with invalid password",
            "description": "Verify login fails",
            "steps": "1. Enter bad password\n2. Submit",
            "expected_result": "Error shown",
            "priority": "medium",
        },
    ]
})


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    return s, headers, client


def test_generate_missing_api_key(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login", "count": 2}, headers=headers)
    assert r.status_code == 503


def test_generate_suite_not_found(auth_client, monkeypatch):
    client, headers = auth_client
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    r = client.post("/api/suites/999/testcases/generate",
                     json={"feature_description": "Login"}, headers=headers)
    assert r.status_code == 404


def test_generate_requires_admin(executor_client, suite, monkeypatch):
    s, _, _ = suite
    exec_client, exec_headers = executor_client
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    r = exec_client.post(f"/api/suites/{s['id']}/testcases/generate",
                          json={"feature_description": "Login"}, headers=exec_headers)
    assert r.status_code == 403


def test_generate_success(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow", "count": 2}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["test_cases"]) == 2
    assert data["test_cases"][0]["title"] == "Login with valid credentials"
    assert data["model"] == "claude-haiku-4-5-20251001"


def test_generate_strips_markdown_fences(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    fenced = f"```json\n{VALID_RESPONSE}\n```"
    _install_fake_anthropic(monkeypatch, response_text=fenced)

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow"}, headers=headers)
    assert r.status_code == 200
    assert len(r.json()["test_cases"]) == 2


def test_generate_invalid_json_response(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text="not valid json at all")

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow"}, headers=headers)
    assert r.status_code == 502


def test_generate_anthropic_error(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, raise_exc=RuntimeError("upstream down"))

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow"}, headers=headers)
    assert r.status_code == 502


def test_generate_ungrounded_by_default_omits_existing_cases_context(auth_client, suite, monkeypatch):
    """grounded defaults to false, so an existing test case in the suite
    must not appear in the prompt sent to the model."""
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "Login with valid credentials"}, headers=headers)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow", "count": 2}, headers=headers)
    assert r.status_code == 200
    assert "already in this suite" not in _FakeMessages.last_call_kwargs["system"]


def test_generate_grounded_includes_existing_cases_in_the_prompt(auth_client, suite, monkeypatch):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={
        "title": "Login with valid credentials", "description": "Verify login succeeds",
    }, headers=headers)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login with email and password", "count": 2, "grounded": True},
                     headers=headers)
    assert r.status_code == 200
    sent = _FakeMessages.last_call_kwargs
    assert "already in this suite" in sent["system"]
    assert "Login with valid credentials" in sent["messages"][0]["content"]


def test_generate_grounded_with_no_existing_cases_still_succeeds(auth_client, suite, monkeypatch):
    s, headers, client = suite
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    r = client.post(f"/api/suites/{s['id']}/testcases/generate",
                     json={"feature_description": "Login flow", "count": 2, "grounded": True}, headers=headers)
    assert r.status_code == 200
    assert "(none yet)" in _FakeMessages.last_call_kwargs["messages"][0]["content"]


def test_save_generated_testcases(auth_client, suite):
    s, headers, client = suite
    payload = [
        {
            "title": "Generated case 1",
            "description": "desc",
            "steps": "steps",
            "expected_result": "result",
            "priority": "high",
        },
        {
            "title": "Generated case 2",
            "description": "desc",
            "steps": "steps",
            "expected_result": "result",
            "priority": "low",
        },
    ]
    r = client.post(f"/api/suites/{s['id']}/testcases/generate/save", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json()["saved"] == 2

    listed = client.get(f"/api/suites/{s['id']}/testcases", headers=headers).json()
    assert len(listed) == 2
    assert all(tc["status"] == "draft" for tc in listed)


def test_save_generated_testcases_stores_embeddings_for_later_retrieval(auth_client, suite):
    """Saved AI-generated cases must be embedded immediately, not just
    lazily on next read - so a grounded generate() call right afterwards
    sees them as existing context without an extra backfill step."""
    from api import models
    from tests.api.conftest import TestingSessionLocal

    s, headers, client = suite
    payload = [{
        "title": "Login with valid credentials", "description": "desc",
        "steps": "steps", "expected_result": "result", "priority": "high",
    }]
    client.post(f"/api/suites/{s['id']}/testcases/generate/save", json=payload, headers=headers)
    saved_id = client.get(f"/api/suites/{s['id']}/testcases", headers=headers).json()[0]["id"]

    db = TestingSessionLocal()
    try:
        row = db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.test_case_id == saved_id).first()
        assert row is not None
    finally:
        db.close()


def test_save_generated_testcases_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.post("/api/suites/999/testcases/generate/save", json=[], headers=headers)
    assert r.status_code == 404


def test_save_generated_testcases_requires_admin(executor_client, suite):
    s, _, _ = suite
    exec_client, exec_headers = executor_client
    r = exec_client.post(f"/api/suites/{s['id']}/testcases/generate/save", json=[], headers=exec_headers)
    assert r.status_code == 403
