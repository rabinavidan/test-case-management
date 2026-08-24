"""services/gateway — routing table (_upstream) as pure unit tests, plus the
HTTP proxy's error handling when a downstream service is unreachable.
"""
import httpx
import pytest
from fastapi.testclient import TestClient

from services.gateway.main import app, _upstream, AUTH_URL, PROJECTS_URL, RUNS_URL, AI_URL


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("path,expected", [
    ("/api/auth/login", AUTH_URL),
    ("/api/auth/register", AUTH_URL),
    ("/api/users", AUTH_URL),
    ("/api/users/5/status", AUTH_URL),
    ("/api/version", AUTH_URL),
    ("/api/projects", PROJECTS_URL),
    ("/api/projects/1/suites", PROJECTS_URL),
    ("/api/suites/1/testcases", PROJECTS_URL),
    ("/api/testcases/1", PROJECTS_URL),
    ("/api/demo/testflow", PROJECTS_URL),
    ("/api/suites/1/testcases/generate/save", PROJECTS_URL),
    ("/api/runs/1", RUNS_URL),
    ("/api/suites/1/runs", RUNS_URL),
    ("/api/runs/1/results/2", RUNS_URL),
    ("/api/suites/1/testcases/generate", AI_URL),
])
def test_upstream_routing_table(path, expected):
    assert _upstream(path) == expected


def test_generate_save_is_not_misrouted_to_ai():
    """`/testcases/generate` is a substring of `/testcases/generate/save` —
    the AI route must not accidentally swallow the save endpoint."""
    assert _upstream("/api/suites/1/testcases/generate/save") == PROJECTS_URL
    assert _upstream("/api/suites/1/testcases/generate") == AI_URL


def test_proxy_returns_503_when_downstream_unreachable(client, monkeypatch):
    async def _raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused", request=None)

    from services.gateway import main as gateway_main
    monkeypatch.setattr(gateway_main._http, "request", _raise_connect_error)

    res = client.get("/api/projects")
    assert res.status_code == 503


def test_proxy_passes_through_downstream_response(client, monkeypatch):
    class _FakeResponse:
        status_code = 200
        content = b'{"ok": true}'
        headers = {"content-type": "application/json"}

    async def _fake_request(*args, **kwargs):
        return _FakeResponse()

    from services.gateway import main as gateway_main
    monkeypatch.setattr(gateway_main._http, "request", _fake_request)

    res = client.get("/api/projects")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
