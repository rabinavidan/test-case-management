import pytest


@pytest.fixture()
def suite_with_cases(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC2", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC3", "status": "draft"}, headers=headers)
    return s, headers, client


def test_create_run(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    r = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Run 1"
    assert len(data["results"]) == 2  # only active test cases
    assert all(res["status"] == "pending" for res in data["results"])


def test_list_runs(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 2"}, headers=headers)
    r = client.get(f"/api/suites/{s['id']}/runs", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_run(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    r = client.get(f"/api/runs/{run['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == run["id"]


def test_update_result(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    tc_id = run["results"][0]["testcase_id"]
    r = client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "pass", "notes": "Looks good"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "pass"
    assert r.json()["notes"] == "Looks good"


def test_run_completes_when_all_results_done(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    for res in run["results"]:
        client.put(f"/api/runs/{run['id']}/results/{res['testcase_id']}", json={"status": "pass"}, headers=headers)
    r = client.get(f"/api/runs/{run['id']}", headers=headers)
    assert r.json()["completed_at"] is not None


def test_create_run_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.post("/api/suites/999/runs", json={"name": "Run"}, headers=headers)
    assert r.status_code == 404


def test_create_run_requires_auth(client, suite_with_cases):
    s, _, _ = suite_with_cases
    r = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run"})
    assert r.status_code == 401


def test_executor_can_create_run(executor_client, suite_with_cases):
    s, _, _ = suite_with_cases
    exec_client, exec_headers = executor_client
    r = exec_client.post(f"/api/suites/{s['id']}/runs", json={"name": "Exec Run"}, headers=exec_headers)
    assert r.status_code == 201


def test_list_runs_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/suites/999/runs", headers=headers)
    assert r.status_code == 404


def test_get_run_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/runs/999", headers=headers)
    assert r.status_code == 404


def test_update_result_not_found(auth_client, suite_with_cases):
    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    r = client.put(f"/api/runs/{run['id']}/results/999", json={"status": "pass"}, headers=headers)
    assert r.status_code == 404


def test_executor_can_update_result(executor_client, suite_with_cases):
    s, admin_headers, client = suite_with_cases
    exec_client, exec_headers = executor_client
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=admin_headers).json()
    tc_id = run["results"][0]["testcase_id"]
    r = exec_client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "fail"}, headers=exec_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "fail"


def test_run_responses_carry_the_creators_username(auth_client, suite_with_cases, executor_client):
    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    assert run["created_by_username"] == "testuser"
    assert client.get(f"/api/runs/{run['id']}", headers=headers).json()["created_by_username"] == "testuser"
    listed = client.get(f"/api/suites/{s['id']}/runs", headers=headers).json()
    assert [r["created_by_username"] for r in listed] == ["testuser"]

    # A run started by an executor is attributed to the executor, not the admin.
    _, exec_headers = executor_client
    exec_run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 2"}, headers=exec_headers).json()
    assert exec_run["created_by_username"] == "executor"


def test_run_without_a_creator_has_null_username(auth_client, suite_with_cases):
    from tests.api.conftest import TestingSessionLocal
    from api import models

    s, headers, client = suite_with_cases
    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Orphan"}, headers=headers).json()
    db = TestingSessionLocal()
    db.query(models.TestRun).filter(models.TestRun.id == run["id"]).update({"created_by_id": None})
    db.commit()
    db.close()
    assert client.get(f"/api/runs/{run['id']}", headers=headers).json()["created_by_username"] is None
