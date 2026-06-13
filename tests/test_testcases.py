import pytest


@pytest.fixture()
def suite(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    return s, headers, client


def test_create_testcase(auth_client, suite):
    s, headers, client = suite
    r = client.post(f"/api/suites/{s['id']}/testcases", json={
        "title": "Login works", "status": "active", "priority": "high",
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Login works"
    assert data["status"] == "active"
    assert data["priority"] == "high"


def test_list_testcases(auth_client, suite):
    s, headers, client = suite
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC1"}, headers=headers)
    client.post(f"/api/suites/{s['id']}/testcases", json={"title": "TC2"}, headers=headers)
    r = client.get(f"/api/suites/{s['id']}/testcases", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_update_testcase(auth_client, suite):
    s, headers, client = suite
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "Old"}, headers=headers).json()
    r = client.put(f"/api/testcases/{tc['id']}", json={"title": "New", "status": "deprecated"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["title"] == "New"
    assert r.json()["status"] == "deprecated"


def test_delete_testcase(auth_client, suite):
    s, headers, client = suite
    tc = client.post(f"/api/suites/{s['id']}/testcases", json={"title": "To Delete"}, headers=headers).json()
    r = client.delete(f"/api/testcases/{tc['id']}", headers=headers)
    assert r.status_code == 204


def test_testcase_suite_not_found(auth_client):
    client, headers = auth_client
    r = client.post("/api/suites/999/testcases", json={"title": "TC"}, headers=headers)
    assert r.status_code == 404
