def test_list_projects_empty(client):
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert r.json() == []


def test_create_project(client):
    r = client.post("/api/projects", json={"name": "My Project", "description": "desc"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "My Project"
    assert data["description"] == "desc"
    assert "id" in data


def test_list_projects_after_create(client):
    client.post("/api/projects", json={"name": "P1"})
    client.post("/api/projects", json={"name": "P2"})
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_delete_project(client):
    r = client.post("/api/projects", json={"name": "To Delete"})
    pid = r.json()["id"]
    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204
    r = client.get("/api/projects")
    assert all(p["id"] != pid for p in r.json())


def test_delete_project_not_found(client):
    r = client.delete("/api/projects/999")
    assert r.status_code == 404
