import pytest


@pytest.fixture()
def project(auth_client):
    client, headers = auth_client
    r = client.post("/api/projects", json={"name": "Test Project"}, headers=headers)
    return r.json(), headers, client


def test_list_suites_empty(auth_client, project):
    proj, headers, client = project
    r = client.get(f"/api/projects/{proj['id']}/suites", headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_create_suite(auth_client, project):
    proj, headers, client = project
    r = client.post(f"/api/projects/{proj['id']}/suites", json={"name": "Login Tests"}, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Login Tests"
    assert data["project_id"] == proj["id"]


def test_create_suite_project_not_found(auth_client):
    client, headers = auth_client
    r = client.post("/api/projects/999/suites", json={"name": "Suite"}, headers=headers)
    assert r.status_code == 404


def test_delete_suite(auth_client, project):
    proj, headers, client = project
    r = client.post(f"/api/projects/{proj['id']}/suites", json={"name": "To Delete"}, headers=headers)
    sid = r.json()["id"]
    r = client.delete(f"/api/suites/{sid}", headers=headers)
    assert r.status_code == 204


def test_project_stats(auth_client, project):
    proj, headers, client = project
    r = client.get(f"/api/projects/{proj['id']}/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total_suites"] == 0
    assert data["total_cases"] == 0
    assert data["total_runs"] == 0
