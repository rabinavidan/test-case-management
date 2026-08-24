"""services/runs — run creation/results, and both directions of its
dependency on the projects service: a mocked happy path, and a real
connection-refused failure returning a clean 503 instead of a crash.
"""
import os
import pytest
import httpx as httpx_module
from fastapi.testclient import TestClient

from conftest import import_service_app, reset_db, mint_token

os.environ.setdefault("PROJECTS_SERVICE_URL", "http://127.0.0.1:1")  # connection-refused

app, db_mod = import_service_app("runs")

ADMIN = {"Authorization": f"Bearer {mint_token(1, 'admin')}"}


@pytest.fixture(autouse=True)
def _reset():
    reset_db(db_mod)
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "runs"}


def test_create_run_returns_503_when_projects_service_unreachable(client):
    """No mock installed here — PROJECTS_SERVICE_URL is genuinely unreachable,
    so create_run()'s httpx.get() call raises, which must surface as a clean
    503, not an unhandled 500."""
    res = client.post("/api/suites/1/runs", json={"name": "Run"}, headers=ADMIN)
    assert res.status_code == 503


def test_create_run_success_with_active_testcases(client, monkeypatch):
    fake_testcases = [{"id": 1}, {"id": 2}]
    monkeypatch.setattr(
        httpx_module, "get",
        lambda url, timeout=None: _FakeResponse(200, fake_testcases),
    )

    created = client.post("/api/suites/5/runs", json={"name": "My Run"}, headers=ADMIN)
    assert created.status_code == 201
    run_id = created.json()["id"]

    listed = client.get("/api/suites/5/runs", headers=ADMIN)
    assert len(listed.json()) == 1

    fetched = client.get(f"/api/runs/{run_id}", headers=ADMIN)
    assert fetched.status_code == 200
    results = fetched.json()["results"]
    assert len(results) == 2  # one pending result per active testcase
    assert all(r["status"] == "pending" for r in results)


def test_create_run_404_when_projects_service_says_suite_missing(client, monkeypatch):
    monkeypatch.setattr(
        httpx_module, "get",
        lambda url, timeout=None: _FakeResponse(404, None),
    )
    res = client.post("/api/suites/999/runs", json={"name": "Run"}, headers=ADMIN)
    assert res.status_code == 404


def test_get_missing_run_404(client):
    assert client.get("/api/runs/999", headers=ADMIN).status_code == 404


def test_update_result_and_run_completion(client, monkeypatch):
    monkeypatch.setattr(
        httpx_module, "get",
        lambda url, timeout=None: _FakeResponse(200, [{"id": 10}]),
    )
    run = client.post("/api/suites/5/runs", json={"name": "R"}, headers=ADMIN).json()

    res = client.put(f"/api/runs/{run['id']}/results/10", json={"status": "pass"}, headers=ADMIN)
    assert res.status_code == 200
    assert res.json()["status"] == "pass"

    fetched = client.get(f"/api/runs/{run['id']}", headers=ADMIN).json()
    assert fetched["completed_at"] is not None  # only result, now non-pending -> run complete


def test_update_result_missing_404(client):
    res = client.put("/api/runs/999/results/999", json={"status": "pass"}, headers=ADMIN)
    assert res.status_code == 404


def test_internal_last_run_stats_with_no_runs(client):
    res = client.get("/internal/projects/last-run-stats", params={"suite_ids": "1,2,3"})
    assert res.status_code == 200
    assert res.json()["total_runs"] == 0
