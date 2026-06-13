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
