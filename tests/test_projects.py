def test_list_projects_empty(auth_client):
    client, headers = auth_client
    r = client.get("/api/projects", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_project(auth_client):
    client, headers = auth_client
    r = client.post("/api/projects", json={"name": "My Project", "description": "desc"}, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "My Project"
    assert data["description"] == "desc"
    assert "id" in data


def test_list_projects_after_create(auth_client):
    client, headers = auth_client
    client.post("/api/projects", json={"name": "P1"}, headers=headers)
    client.post("/api/projects", json={"name": "P2"}, headers=headers)
    r = client.get("/api/projects", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2
    assert body["total"] == 2


def test_delete_project(auth_client):
    client, headers = auth_client
    r = client.post("/api/projects", json={"name": "To Delete"}, headers=headers)
    pid = r.json()["id"]
    r = client.delete(f"/api/projects/{pid}", headers=headers)
    assert r.status_code == 204
    r = client.get("/api/projects", headers=headers)
    assert all(p["id"] != pid for p in r.json()["items"])


def test_delete_project_not_found(auth_client):
    client, headers = auth_client
    r = client.delete("/api/projects/999", headers=headers)
    assert r.status_code == 404
