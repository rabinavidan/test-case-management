import pytest


@pytest.fixture()
def project(client):
    r = client.post("/api/projects", json={"name": "Test Project"})
    return r.json()


def test_list_suites_empty(client, project):
    r = client.get(f"/api/projects/{project['id']}/suites")
    assert r.status_code == 200
    assert r.json() == []


def test_create_suite(client, project):
    r = client.post(f"/api/projects/{project['id']}/suites", json={"name": "Login Tests"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Login Tests"
    assert data["project_id"] == project["id"]


def test_create_suite_project_not_found(client):
    r = client.post("/api/projects/999/suites", json={"name": "Suite"})
    assert r.status_code == 404


def test_delete_suite(client, project):
    r = client.post(f"/api/projects/{project['id']}/suites", json={"name": "To Delete"})
    sid = r.json()["id"]
    r = client.delete(f"/api/suites/{sid}")
    assert r.status_code == 204


def test_project_stats(client, project):
    r = client.get(f"/api/projects/{project['id']}/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total_suites"] == 0
    assert data["total_cases"] == 0
    assert data["total_runs"] == 0
