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
    def __init__(self, response_text=None, raise_exc=None):
        self._response_text = response_text
        self._raise_exc = raise_exc

    def create(self, **kwargs):
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


@pytest.fixture()
def run_with_results(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={
        "title": "Checkout with expired card", "status": "active",
        "steps": "1. Add item\n2. Pay with expired card",
        "expected_result": "Payment declined with a clear error",
    }, headers=headers)
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    return run, headers, client


def test_triage_run_not_found(auth_client):
    client, headers = auth_client
    r = client.post("/api/runs/999/triage", headers=headers)
    assert r.status_code == 404


def test_triage_requires_admin(executor_client, run_with_results):
    run, _, _ = run_with_results
    exec_client, exec_headers = executor_client
    r = exec_client.post(f"/api/runs/{run['id']}/triage", headers=exec_headers)
    assert r.status_code == 403


def test_triage_no_problem_results(auth_client, run_with_results):
    run, headers, client = run_with_results
    r = client.post(f"/api/runs/{run['id']}/triage", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "nothing to triage" in data["summary"].lower()
    assert data["problem_results"] == []


def test_triage_missing_api_key(auth_client, run_with_results, monkeypatch):
    run, headers, client = run_with_results
    tc_id = run["results"][0]["testcase_id"]
    client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "fail", "notes": "Card was accepted"}, headers=headers)

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post(f"/api/runs/{run['id']}/triage", headers=headers)
    assert r.status_code == 503


def test_triage_success(auth_client, run_with_results, monkeypatch):
    run, headers, client = run_with_results
    tc_id = run["results"][0]["testcase_id"]
    client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "fail", "notes": "Card was accepted"}, headers=headers)

    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text="The payment gateway isn't validating card expiry before authorizing.")

    r = client.post(f"/api/runs/{run['id']}/triage", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "payment gateway" in data["summary"]
    assert data["model"] == "claude-haiku-4-5-20251001"
    assert len(data["problem_results"]) == 1
    assert data["problem_results"][0]["status"] == "fail"
    assert data["problem_results"][0]["notes"] == "Card was accepted"


def test_triage_anthropic_error(auth_client, run_with_results, monkeypatch):
    run, headers, client = run_with_results
    tc_id = run["results"][0]["testcase_id"]
    client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "fail"}, headers=headers)

    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, raise_exc=RuntimeError("upstream down"))

    r = client.post(f"/api/runs/{run['id']}/triage", headers=headers)
    assert r.status_code == 502
