"""Agentic AI Failure Triage (course milestone M7 - docs/ai-roadmap.md).

A scripted fake Anthropic client plays the model: each test hands it the
sequence of responses (tool_use turns, then a final text turn) and asserts on
the tool results the real handlers sent back - no API key, no network.
"""
import json

import anthropic
import pytest


class _Block:
    def __init__(self, type, **kw):
        self.type = type
        for k, v in kw.items():
            setattr(self, k, v)


class _Usage:
    input_tokens = 100
    output_tokens = 20


class _Message:
    def __init__(self, blocks):
        self.content = blocks
        self.usage = _Usage()


def text(t):
    return _Message([_Block("text", text=t)])


def tool_use(name, input, id="tu_1"):
    return _Message([_Block("tool_use", id=id, name=name, input=input)])


def _install_scripted_anthropic(monkeypatch, script):
    """script: list of _Message returned in order. Every request's kwargs
    are appended to the returned list for assertions."""
    calls = []
    responses = iter(script)

    class _Messages:
        def create(self, **kwargs):
            calls.append(json.loads(json.dumps(kwargs, default=str)))
            return next(responses)

    class _Fake:
        def __init__(self, api_key=None):
            self.messages = _Messages()

    monkeypatch.setattr(anthropic, "Anthropic", _Fake)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    return calls


@pytest.fixture()
def failing_run(auth_client):
    """Suite with one case that passed, failed, passed across three earlier
    runs and then fails in the run being triaged - a flip-flopping history."""
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "P"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "S"}, headers=headers).json()
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={
        "title": "Checkout with expired card", "status": "active",
        "description": "Payment declined for expired card",
    }, headers=headers).json()
    for i, status in enumerate(["pass", "fail", "pass"]):
        r = client.post(f"/api/suites/{s['id']}/runs", json={"name": f"Earlier {i}"}, headers=headers).json()
        client.put(f"/api/runs/{r['id']}/results/{tc['id']}", json={"status": status}, headers=headers)
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Nightly"}, headers=headers).json()
    client.put(f"/api/runs/{run['id']}/results/{tc['id']}", json={"status": "fail", "notes": "Card accepted"},
               headers=headers)
    return client, headers, run, tc


def test_agentic_triage_runs_tool_loop_and_returns_trace(failing_run, monkeypatch):
    client, headers, run, tc = failing_run
    calls = _install_scripted_anthropic(monkeypatch, [
        tool_use("get_test_case_history", {"testcase_id": tc["id"]}),
        tool_use("get_suite_flaky_tests", {}, id="tu_2"),
        text("Flaky, not a regression: the case has flip-flopped pass/fail across runs."),
    ])

    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["mode"] == "agentic"
    assert data["summary"].startswith("Flaky")
    assert [c["name"] for c in data["tool_calls"]] == ["get_test_case_history", "get_suite_flaky_tests"]
    assert not any(c["is_error"] for c in data["tool_calls"])
    assert data["hit_iteration_cap"] is False

    # The model was offered the tools and told the case's ID so it can call them.
    assert {t["name"] for t in calls[0]["tools"]} == {
        "get_test_case_history", "get_similar_test_cases", "get_suite_flaky_tests"}
    assert f"testcase_id={tc['id']}" in calls[0]["messages"][0]["content"]

    # Real handler output went back as the tool_result for the model's next turn.
    history = json.loads(calls[1]["messages"][-1]["content"][0]["content"])
    assert [h["status"] for h in history["history"]] == ["pass", "fail", "pass", "fail"]
    flaky = json.loads(calls[2]["messages"][-1]["content"][0]["content"])
    assert flaky["flaky_tests"][0]["testcase_id"] == tc["id"]


def test_agentic_triage_similar_cases_tool_uses_retrieval(failing_run, monkeypatch):
    client, headers, run, tc = failing_run
    calls = _install_scripted_anthropic(monkeypatch, [
        tool_use("get_similar_test_cases", {"query": "expired card payment", "k": 3}),
        text("Payment validation regression."),
    ])
    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200
    similar = json.loads(calls[1]["messages"][-1]["content"][0]["content"])["similar"]
    assert similar[0]["testcase_id"] == tc["id"]


def test_agentic_triage_rejects_testcase_outside_suite(failing_run, monkeypatch):
    """Tool arguments are untrusted model output: another suite's case is an
    is_error tool result, never data."""
    client, headers, run, _ = failing_run
    calls = _install_scripted_anthropic(monkeypatch, [
        tool_use("get_test_case_history", {"testcase_id": 99999}),
        text("Could not confirm history; likely a payment regression."),
    ])
    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200
    assert r.json()["tool_calls"][0]["is_error"] is True
    tool_result = calls[1]["messages"][-1]["content"][0]
    assert tool_result["is_error"] is True
    assert "not found in this run's suite" in tool_result["content"]


def test_agentic_triage_unknown_tool_is_reported_to_model(failing_run, monkeypatch):
    client, headers, run, _ = failing_run
    _install_scripted_anthropic(monkeypatch, [
        tool_use("drop_database", {}),
        text("Answering without that tool."),
    ])
    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200
    call = r.json()["tool_calls"][0]
    assert call["is_error"] is True and "Unknown tool" in call["result_preview"]


def test_agentic_triage_loop_is_bounded(failing_run, monkeypatch):
    """A model that never stops calling tools is forced to answer after
    max_iterations (4) - the 5th request disables tools."""
    client, headers, run, tc = failing_run
    script = [tool_use("get_suite_flaky_tests", {}, id=f"tu_{i}") for i in range(4)]
    script.append(text("Forced answer with the evidence gathered so far."))
    calls = _install_scripted_anthropic(monkeypatch, script)

    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["hit_iteration_cap"] is True
    assert len(data["tool_calls"]) == 4
    assert len(calls) == 5
    assert calls[-1]["tool_choice"] == {"type": "none"}
    assert "tool_choice" not in calls[0]


def test_agentic_triage_api_error_is_502(failing_run, monkeypatch):
    client, headers, run, _ = failing_run

    class _Boom:
        def __init__(self, api_key=None):
            self.messages = self

        def create(self, **kwargs):
            raise RuntimeError("upstream down")

    monkeypatch.setattr(anthropic, "Anthropic", _Boom)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 502


def test_agentic_flag_falls_back_to_single_shot_for_non_anthropic(failing_run, monkeypatch):
    import httpx

    from api import ai_gateway

    client, headers, run, _ = failing_run
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("AI_MODEL", "qwen2.5:0.5b")
    monkeypatch.setattr(ai_gateway.httpx, "post", lambda url, json, timeout: httpx.Response(
        200, json={"message": {"content": "Single-shot diagnosis."}}, request=httpx.Request("POST", url),
    ))
    r = client.post(f"/api/runs/{run['id']}/triage?agentic=true", headers=headers)
    assert r.status_code == 200
    assert r.json()["mode"] == "single_shot"
    assert r.json()["tool_calls"] == []


def test_default_triage_stays_single_shot(failing_run, monkeypatch):
    client, headers, run, _ = failing_run
    calls = _install_scripted_anthropic(monkeypatch, [text("Plain diagnosis.")])
    r = client.post(f"/api/runs/{run['id']}/triage", headers=headers)
    assert r.status_code == 200
    assert r.json()["mode"] == "single_shot"
    assert "tools" not in calls[0]
