import pytest


@pytest.fixture()
def suite(client):
    p = client.post("/api/projects", json={"name": "Project"}).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}).json()
    return s


def test_create_testcase(client, suite):
    r = client.post(f"/api/suites/{suite['id']}/testcases", json={
        "title": "Login works",
        "status": "active",
        "priority": "high",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Login works"
    assert data["status"] == "active"
    assert data["priority"] == "high"


def test_list_testcases(client, suite):
    client.post(f"/api/suites/{suite['id']}/testcases", json={"title": "TC1"})
    client.post(f"/api/suites/{suite['id']}/testcases", json={"title": "TC2"})
    r = client.get(f"/api/suites/{suite['id']}/testcases")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_update_testcase(client, suite):
    tc = client.post(f"/api/suites/{suite['id']}/testcases", json={"title": "Old"}).json()
    r = client.put(f"/api/testcases/{tc['id']}", json={"title": "New", "status": "deprecated"})
    assert r.status_code == 200
    assert r.json()["title"] == "New"
    assert r.json()["status"] == "deprecated"


def test_delete_testcase(client, suite):
    tc = client.post(f"/api/suites/{suite['id']}/testcases", json={"title": "To Delete"}).json()
    r = client.delete(f"/api/testcases/{tc['id']}")
    assert r.status_code == 204


def test_testcase_suite_not_found(client):
    r = client.post("/api/suites/999/testcases", json={"title": "TC"})
    assert r.status_code == 404
