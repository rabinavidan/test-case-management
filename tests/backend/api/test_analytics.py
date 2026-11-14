def test_project_analytics_not_found(auth_client):
    client, headers = auth_client
    r = client.get("/api/projects/999/analytics", headers=headers)
    assert r.status_code == 404


def test_project_analytics_empty_project(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Empty"}, headers=headers).json()
    r = client.get(f"/api/projects/{p['id']}/analytics", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["project_id"] == p["id"]
    assert data["run_history"] == []
    assert data["suite_coverage"] == []


def test_project_analytics_with_completed_run(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Analytics Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC2", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC3 (draft)", "status": "draft"}, headers=headers)

    run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers).json()
    results = run["results"]
    client.put(f"/api/runs/{run['id']}/results/{results[0]['testcase_id']}", json={"status": "pass"}, headers=headers)
    client.put(f"/api/runs/{run['id']}/results/{results[1]['testcase_id']}", json={"status": "fail"}, headers=headers)

    r = client.get(f"/api/projects/{p['id']}/analytics", headers=headers)
    assert r.status_code == 200
    data = r.json()

    assert len(data["run_history"]) == 1
    point = data["run_history"][0]
    assert point["run_name"] == "Run 1"
    assert point["pass_count"] == 1
    assert point["fail_count"] == 1
    assert point["skip_count"] == 0
    assert point["total"] == 2
    assert point["pass_rate"] == 50.0

    assert len(data["suite_coverage"]) == 1
    coverage = data["suite_coverage"][0]
    assert coverage["suite_name"] == "Suite"
    assert coverage["total"] == 3
    assert coverage["active"] == 2


def test_project_analytics_excludes_incomplete_runs(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Incomplete Runs"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1", "status": "active"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/runs", json={"name": "Unfinished Run"}, headers=headers)

    r = client.get(f"/api/projects/{p['id']}/analytics", headers=headers)
    assert r.status_code == 200
    assert r.json()["run_history"] == []


def test_project_analytics_is_public(client, auth_client):
    _, headers = auth_client
    p = client.post("/api/projects", json={"name": "Public Analytics"}, headers=headers).json()
    r = client.get(f"/api/projects/{p['id']}/analytics")
    assert r.status_code == 200
