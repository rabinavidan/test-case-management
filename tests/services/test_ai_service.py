"""services/ai — Claude Haiku test-case generation. No DB of its own; talks
to the projects service (best-effort, for the suite name) and Anthropic.
"""
import json
import os

import anthropic
import httpx as httpx_module
import pytest
from fastapi.testclient import TestClient

from conftest import mint_token

os.environ.setdefault("PROJECTS_SERVICE_URL", "http://127.0.0.1:1")  # connection-refused

from services.ai.main import app  # noqa: E402  (must follow the env var above)

ADMIN = {"Authorization": f"Bearer {mint_token(1, 'admin')}"}
EXECUTOR = {"Authorization": f"Bearer {mint_token(2, 'executor')}"}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


class _FakeContentBlock:
    def __init__(self, text):
        self.text = text


class _FakeMessage:
    def __init__(self, text, model="claude-haiku-4-5-20251001"):
        self.content = [_FakeContentBlock(text)]
        self.model = model


class _FakeMessages:
    def __init__(self, response_text=None, raise_exc=None):
        self._response_text = response_text
        self._raise_exc = raise_exc

    def create(self, **kwargs):
        if self._raise_exc:
            raise self._raise_exc
        return _FakeMessage(self._response_text)


class _FakeAnthropic:
    response_text = None
    raise_exc = None

    def __init__(self, api_key=None):
        self.messages = _FakeMessages(self.response_text, self.raise_exc)


def _install_fake_anthropic(monkeypatch, response_text=None, raise_exc=None):
    fake_cls = type("_FakeAnthropic", (_FakeAnthropic,), {
        "response_text": response_text, "raise_exc": raise_exc,
    })
    monkeypatch.setattr(anthropic, "Anthropic", fake_cls)


VALID_RESPONSE = json.dumps({
    "test_cases": [
        {"title": "Login with valid credentials", "description": "d", "steps": "s",
         "expected_result": "logged in", "priority": "high"},
    ],
})


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "ai"}


def test_generate_requires_admin(client):
    res = client.post("/api/suites/1/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=EXECUTOR)
    assert res.status_code == 403


def test_generate_without_api_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = client.post("/api/suites/1/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=ADMIN)
    assert res.status_code == 503


def test_generate_success(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    res = client.post("/api/suites/1/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=ADMIN)
    assert res.status_code == 200
    body = res.json()
    assert len(body["test_cases"]) == 1
    assert body["test_cases"][0]["title"] == "Login with valid credentials"
    assert body["model"] == "claude-haiku-4-5-20251001"


def test_generate_invalid_json_from_model_returns_502(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    _install_fake_anthropic(monkeypatch, response_text="not json at all")

    res = client.post("/api/suites/1/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=ADMIN)
    assert res.status_code == 502


def test_generate_still_works_when_projects_service_unreachable(client, monkeypatch):
    """Suite-name lookup from the projects service is best-effort (wrapped in
    try/except) — PROJECTS_SERVICE_URL is genuinely unreachable here, and
    generation must still succeed with the fallback suite name."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    _install_fake_anthropic(monkeypatch, response_text=VALID_RESPONSE)

    res = client.post("/api/suites/42/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=ADMIN)
    assert res.status_code == 200


def test_generate_404_when_projects_service_says_suite_missing(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    class _FakeResp:
        status_code = 404

        def json(self):
            return {}

    monkeypatch.setattr(httpx_module, "get", lambda *a, **k: _FakeResp())
    res = client.post("/api/suites/1/testcases/generate", json={
        "feature_description": "Login", "count": 1,
    }, headers=ADMIN)
    assert res.status_code == 404
