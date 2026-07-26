import pytest

DEMO_ENDPOINTS = [
    "/api/demo/alerts-microservice",
    "/api/demo/testflow",
    "/api/demo/playwright",
]


@pytest.mark.parametrize("endpoint", DEMO_ENDPOINTS)
def test_demo_seed_requires_auth(client, endpoint):
    r = client.post(endpoint)
    assert r.status_code == 401


@pytest.mark.parametrize("endpoint", DEMO_ENDPOINTS)
def test_demo_seed_creates_populated_project(auth_client, endpoint):
    client, headers = auth_client
    r = client.post(endpoint, headers=headers)
    assert r.status_code == 200
    project = r.json()
    assert "id" in project
    assert project["name"]

    stats = client.get(f"/api/projects/{project['id']}/stats", headers=headers).json()
    assert stats["total_suites"] > 0
    assert stats["total_cases"] > 0
    assert stats["total_runs"] > 0

    suites = client.get(f"/api/projects/{project['id']}/suites", headers=headers).json()
    assert len(suites) == stats["total_suites"]
    for suite in suites:
        cases = client.get(f"/api/suites/{suite['id']}/testcases", headers=headers).json()
        assert len(cases) > 0
        runs = client.get(f"/api/suites/{suite['id']}/runs", headers=headers).json()
        assert len(runs) == 1
        assert runs[0]["completed_at"] is not None


@pytest.mark.parametrize("endpoint", DEMO_ENDPOINTS)
def test_demo_seed_allows_executor(executor_client, endpoint):
    client, headers = executor_client
    r = client.post(endpoint, headers=headers)
    assert r.status_code == 200


def test_demo_seed_runs_have_only_pass_fail_skip_results(auth_client):
    client, headers = auth_client
    project = client.post("/api/demo/testflow", headers=headers).json()
    suites = client.get(f"/api/projects/{project['id']}/suites", headers=headers).json()
    for suite in suites:
        runs = client.get(f"/api/suites/{suite['id']}/runs", headers=headers).json()
        for run in runs:
            details = client.get(f"/api/runs/{run['id']}", headers=headers).json()
            for result in details["results"]:
                assert result["status"] in ("pass", "fail", "skip")
