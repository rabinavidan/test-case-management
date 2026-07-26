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


def test_project_stats_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/projects/999/stats", headers=headers)
    assert r.status_code == 404


def test_list_suites_project_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/projects/999/suites", headers=headers)
    assert r.status_code == 404


def test_delete_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.delete("/api/suites/999", headers=headers)
    assert r.status_code == 404


def test_list_suites_is_public(client, project):
    proj, headers, _ = project
    r = client.get(f"/api/projects/{proj['id']}/suites")
    assert r.status_code == 200


def test_executor_cannot_create_suite(executor_client, project):
    proj, _, _ = project
    exec_client, exec_headers = executor_client
    r = exec_client.post(f"/api/projects/{proj['id']}/suites", json={"name": "Nope"}, headers=exec_headers)
    assert r.status_code == 403


def test_project_stats_reflects_skip_and_pending_results(auth_client, project):
    proj, headers, client = project
    s = client.post(f"/api/projects/{proj['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC2", "status": "active"}, headers=headers)
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    results = run["results"]
    client.put(f"/api/runs/{run['id']}/results/{results[0]['testcase_id']}", json={"status": "skip"}, headers=headers)
    # Second result left as "pending" on purpose.

    r = client.get(f"/api/projects/{proj['id']}/stats", headers=headers)
    data = r.json()
    assert data["last_run_skip"] == 1
    assert data["last_run_pending"] == 1
    assert data["last_run_name"] == "Run 1"


def test_executor_cannot_delete_suite(executor_client, project):
    proj, admin_headers, client = project
    exec_client, exec_headers = executor_client
    s = client.post(f"/api/projects/{proj['id']}/suites", json={"name": "Suite"}, headers=admin_headers).json()
    r = exec_client.delete(f"/api/suites/{s['id']}", headers=exec_headers)
    assert r.status_code == 403
