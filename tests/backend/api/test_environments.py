import pytest


def test_list_environments_returns_the_four_seeded_environments(auth_client):
    client, headers = auth_client
    r = client.get("/api/environments", headers=headers)
    assert r.status_code == 200
    envs = r.json()
    assert [e["key"] for e in envs] == ["staging", "regression", "preprod", "prod"]
    for e in envs:
        assert e["status"] in ("healthy", "degraded", "down")
        assert e["pods_ready"] <= e["pods_desired"]
        assert e["node_name"]
        assert e["namespace"]


def test_list_environments_requires_auth(client):
    r = client.get("/api/environments")
    assert r.status_code == 401


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    return s, headers, client


def test_create_run_with_environment_key(suite):
    s, headers, client = suite
    r = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1", "environment_key": "prod"}, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["environment_key"] == "prod"
    assert data["environment_name"] == "Prod"


def test_create_run_without_environment_key(suite):
    s, headers, client = suite
    r = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1"}, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["environment_key"] is None
    assert data["environment_name"] is None


def test_create_run_with_unknown_environment_key_is_rejected(suite):
    s, headers, client = suite
    r = client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1", "environment_key": "nope"}, headers=headers)
    assert r.status_code == 400


def test_list_runs_includes_environment(suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/runs", json={"name": "Run 1", "environment_key": "staging"}, headers=headers)
    r = client.get(f"/api/suites/{s['id']}/runs", headers=headers)
    assert r.status_code == 200
    assert r.json()[0]["environment_key"] == "staging"
