import pytest


@pytest.fixture()
def suite_with_cases(client):
    p = client.post("/api/projects", json={"name": "Project"}).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1", "status": "active"})
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC2", "status": "active"})
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC3", "status": "draft"})
    return s


def test_create_run(client, suite_with_cases):
    r = client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 1"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Run 1"
    assert len(data["results"]) == 2  # only active test cases
    assert all(res["status"] == "pending" for res in data["results"])


def test_list_runs(client, suite_with_cases):
    client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 1"})
    client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 2"})
    r = client.get(f"/api/suites/{suite_with_cases['id']}/runs")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_run(client, suite_with_cases):
    run = client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 1"}).json()
    r = client.get(f"/api/runs/{run['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == run["id"]


def test_update_result(client, suite_with_cases):
    run = client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 1"}).json()
    tc_id = run["results"][0]["testcase_id"]
    r = client.put(f"/api/runs/{run['id']}/results/{tc_id}", json={"status": "pass", "notes": "Looks good"})
    assert r.status_code == 200
    assert r.json()["status"] == "pass"
    assert r.json()["notes"] == "Looks good"


def test_run_completes_when_all_results_done(client, suite_with_cases):
    run = client.post(f"/api/suites/{suite_with_cases['id']}/runs", json={"name": "Run 1"}).json()
    for res in run["results"]:
        client.put(f"/api/runs/{run['id']}/results/{res['testcase_id']}", json={"status": "pass"})
    r = client.get(f"/api/runs/{run['id']}")
    assert r.json()["completed_at"] is not None
