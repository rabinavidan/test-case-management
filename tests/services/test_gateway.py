"""services/gateway — the declarative routing table (services/gateway/routes.py)
and the HTTP proxy's error handling when a downstream service is unreachable.
"""
import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import import_service_app
from services.gateway.main import app, _upstream, AUTH_URL, PROJECTS_URL, RUNS_URL, AI_URL
from services.gateway.routes import ROUTES, resolve_service


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


def test_unmatched_path_resolves_to_no_service():
    """A path that matches no declared route is a routing-table gap, not an
    auth-service request — the gateway responds 404 directly rather than
    guessing (see test_proxy_returns_404_for_unmatched_path below)."""
    assert resolve_service("/api/does-not-exist") is None
    assert _upstream("/api/does-not-exist") is None


def test_proxy_returns_404_for_unmatched_path(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404


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


def test_proxy_mints_and_forwards_a_request_id_when_client_sends_none(client, monkeypatch):
    from services.common.request_id import REQUEST_ID_HEADER

    captured_headers = {}

    async def _fake_request(method, url, content=None, headers=None):
        captured_headers.update(headers or {})
        class _FakeResponse:
            status_code = 200
            content = b'{}'
            headers = {"content-type": "application/json"}
        return _FakeResponse()

    from services.gateway import main as gateway_main
    monkeypatch.setattr(gateway_main._http, "request", _fake_request)

    res = client.get("/api/projects")
    minted = res.headers[REQUEST_ID_HEADER]
    assert minted
    assert captured_headers[REQUEST_ID_HEADER] == minted


def test_proxy_forwards_the_clients_own_request_id_unchanged(client, monkeypatch):
    from services.common.request_id import REQUEST_ID_HEADER

    captured_headers = {}

    async def _fake_request(method, url, content=None, headers=None):
        captured_headers.update(headers or {})
        class _FakeResponse:
            status_code = 200
            content = b'{}'
            headers = {"content-type": "application/json"}
        return _FakeResponse()

    from services.gateway import main as gateway_main
    monkeypatch.setattr(gateway_main._http, "request", _fake_request)

    res = client.get("/api/projects", headers={REQUEST_ID_HEADER: "client-set-this"})
    assert res.headers[REQUEST_ID_HEADER] == "client-set-this"
    assert captured_headers[REQUEST_ID_HEADER] == "client-set-this"


# ─── Self-verification: the table vs. the real services ───────────────────────
#
# routes.py's exact-template matching already rules out one route silently
# swallowing another (see its docstring). What hand-picked examples above
# still can't catch is table drift relative to the real services — exactly
# what a developer adding/renaming/removing an endpoint would forget to
# update here. So instead, import each real service app and diff its actual
# declared `/api/*` routes against the table in both directions: every real
# route must appear here under the right service, and every table entry
# must correspond to a route that actually still exists.

SERVICES = ["auth", "projects", "runs", "ai"]


def _real_api_routes(service: str) -> set[str]:
    if service == "ai":
        # ai has no DB of its own (see tests/services/test_ai_service.py),
        # so it isn't wired through import_service_app's SQLite-attach setup.
        from services.ai.main import app as service_app
    else:
        service_app, _ = import_service_app(service)
    return {
        route.path for route in service_app.routes
        if getattr(route, "path", "").startswith("/api/")
    }


@pytest.mark.parametrize("service", SERVICES)
def test_routing_table_matches_real_service_routes(service):
    real_routes = _real_api_routes(service)
    assert real_routes, f"{service} declared no /api/* routes — is the check itself broken?"
    for path in real_routes:
        assert resolve_service(path) == service, (
            f"{service}'s real route {path!r} resolves to "
            f"{resolve_service(path)!r} via the gateway's routing table, not {service!r} — "
            f"add/fix its entry in services/gateway/routes.py (and make sure any more "
            f"specific overlapping route is listed above it)."
        )


def test_routing_table_has_no_stale_entries():
    real_routes_by_service = {service: _real_api_routes(service) for service in SERVICES}
    for template, service in ROUTES:
        assert template in real_routes_by_service[service], (
            f"services/gateway/routes.py declares {template!r} -> {service!r}, but {service} "
            f"has no such route anymore — remove or fix this stale entry."
        )
