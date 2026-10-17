"""services/projects — projects/suites/testcases CRUD, and graceful degradation
when the runs service (called for stats/analytics) is unreachable.
"""
import os
import pytest
from fastapi.testclient import TestClient

from conftest import import_service_app, reset_db, mint_token

os.environ.setdefault("RUNS_SERVICE_URL", "http://127.0.0.1:1")  # always connection-refused

app, db_mod = import_service_app("projects")

ADMIN = {"Authorization": f"Bearer {mint_token(1, 'admin')}"}
EXECUTOR = {"Authorization": f"Bearer {mint_token(2, 'executor')}"}


@pytest.fixture(autouse=True)
def _reset():
    reset_db(db_mod)
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "projects"}


def test_health_live_and_ready(client):
    assert client.get("/health/live").json() == {"status": "ok", "service": "projects"}
    res = client.get("/health/ready")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "projects", "checks": {"database": "ok"}}


def test_health_ready_503_when_database_down_but_live_stays_up(client, monkeypatch):
    """A DB outage must pull the pod out of rotation (readiness), never
    restart it (liveness) — see services/common/health.py."""
    import sys
    from sqlalchemy import create_engine
    monkeypatch.setattr(sys.modules["services.projects.main"], "engine",
                        create_engine("sqlite:////nonexistent-dir/unreachable.db"))
    res = client.get("/health/ready")
    assert res.status_code == 503
    assert res.json()["checks"] == {"database": "fail"}
    assert client.get("/health/live").status_code == 200


def test_create_and_list_projects(client):
    created = client.post("/api/projects", json={"name": "Proj A"}, headers=ADMIN)
    assert created.status_code == 201

    listed = client.get("/api/projects", headers=ADMIN)
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Proj A"


def test_executor_cannot_create_project(client):
    res = client.post("/api/projects", json={"name": "Nope"}, headers=EXECUTOR)
    assert res.status_code == 403


def test_delete_project_removes_it(client):
    created = client.post("/api/projects", json={"name": "To delete"}, headers=ADMIN).json()
    res = client.delete(f"/api/projects/{created['id']}", headers=ADMIN)
    assert res.status_code == 204
    assert client.get("/api/projects", headers=ADMIN).json()["total"] == 0


def test_delete_missing_project_404(client):
    assert client.delete("/api/projects/999", headers=ADMIN).status_code == 404


def test_get_project_and_suite_by_id(client):
    project = client.post("/api/projects", json={"name": "P"}, headers=ADMIN).json()
    suite = client.post(f"/api/projects/{project['id']}/suites", json={"name": "S"}, headers=ADMIN).json()

    got = client.get(f"/api/projects/{project['id']}")
    assert got.status_code == 200
    assert got.json()["name"] == "P"

    got = client.get(f"/api/suites/{suite['id']}")
    assert got.status_code == 200
    assert got.json()["project_id"] == project["id"]

    assert client.get("/api/projects/999").status_code == 404
    assert client.get("/api/suites/999").status_code == 404


def test_suite_and_testcase_crud(client):
    project = client.post("/api/projects", json={"name": "P"}, headers=ADMIN).json()

    suite = client.post(f"/api/projects/{project['id']}/suites", json={"name": "S"}, headers=ADMIN)
    assert suite.status_code == 201
    suite_id = suite.json()["id"]

    listed = client.get(f"/api/projects/{project['id']}/suites", headers=ADMIN)
    assert len(listed.json()) == 1

    tc = client.post(f"/api/suites/{suite_id}/testcases", json={
        "title": "TC1", "status": "active", "priority": "high",
    }, headers=ADMIN)
    assert tc.status_code == 201
    tc_id = tc.json()["id"]

    updated = client.put(f"/api/testcases/{tc_id}", json={"title": "TC1 renamed"}, headers=ADMIN)
    assert updated.status_code == 200
    assert updated.json()["title"] == "TC1 renamed"

    deleted = client.delete(f"/api/testcases/{tc_id}", headers=ADMIN)
    assert deleted.status_code == 204
    assert client.get(f"/api/suites/{suite_id}/testcases", headers=ADMIN).json() == []


def test_suite_create_under_missing_project_404(client):
    res = client.post("/api/projects/999/suites", json={"name": "S"}, headers=ADMIN)
    assert res.status_code == 404


def test_testcase_create_under_missing_suite_404(client):
    res = client.post("/api/suites/999/testcases", json={"title": "T"}, headers=ADMIN)
    assert res.status_code == 404


def test_stats_degrades_gracefully_when_runs_service_unreachable(client):
    """RUNS_SERVICE_URL points at a guaranteed connection-refused address —
    project_stats()'s httpx.get() call is wrapped in try/except and must
    still return 200 with zeroed-out run stats, not blow up."""
    project = client.post("/api/projects", json={"name": "P"}, headers=ADMIN).json()
    client.post(f"/api/projects/{project['id']}/suites", json={"name": "S"}, headers=ADMIN)

    res = client.get(f"/api/projects/{project['id']}/stats", headers=ADMIN)
    assert res.status_code == 200
    body = res.json()
    assert body["total_suites"] == 1
    assert body["total_runs"] == 0
    assert body["last_run_name"] is None


def test_analytics_degrades_gracefully_when_runs_service_unreachable(client):
    project = client.post("/api/projects", json={"name": "P"}, headers=ADMIN).json()
    client.post(f"/api/projects/{project['id']}/suites", json={"name": "S"}, headers=ADMIN)

    res = client.get(f"/api/projects/{project['id']}/analytics", headers=ADMIN)
    assert res.status_code == 200
    assert res.json()["run_history"] == []


def test_demo_seed_endpoint_still_creates_data_when_runs_service_unreachable(client):
    """The demo-seed flow also calls the runs service (fire-and-forget, to
    seed sample runs) — that failing must not stop the project/suite/testcase
    data itself from being created."""
    res = client.post("/api/demo/testflow", headers=ADMIN)
    assert res.status_code == 200
    project_id = res.json()["id"]

    suites = client.get(f"/api/projects/{project_id}/suites", headers=ADMIN)
    assert len(suites.json()) > 0


def test_ai_draft_review_saves_kept_drafts_and_records_every_verdict(client):
    # Same contract as the monolith's (tests/api/test_ai_reviews.py).
    project = client.post("/api/projects", json={"name": "P"}, headers=ADMIN).json()
    suite = client.post(f"/api/projects/{project['id']}/suites", json={"name": "S"}, headers=ADMIN).json()
    draft = {"title": "Login", "priority": "high"}
    res = client.post(f"/api/suites/{suite['id']}/testcases/generate/review", headers=ADMIN, json={
        "feature_description": "Login", "decisions": [
            {"output": draft, "verdict": "accepted"},
            {"output": draft, "verdict": "rejected", "reason": "misses lockout", "must_cover": ["lockout"]},
        ]})
    assert res.status_code == 200, res.text
    assert res.json()["saved"] == 1 and res.json()["rejected"] == 1
    reviews = client.get("/api/ai/reviews", headers=ADMIN).json()
    assert sorted(r["verdict"] for r in reviews) == ["accepted", "rejected"]
    assert all(r["reviewer"] == "user:1" for r in reviews)
    assert client.get("/api/ai/reviews", headers=EXECUTOR).status_code == 403
