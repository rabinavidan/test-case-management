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


def test_list_projects_is_public(client):
    r = client.get("/api/projects")
    assert r.status_code == 200


def test_executor_cannot_delete_project(executor_client, auth_client):
    exec_client, exec_headers = executor_client
    _, admin_headers = auth_client
    p = exec_client.post("/api/projects", json={"name": "Admin Made"}, headers=admin_headers).json()
    r = exec_client.delete(f"/api/projects/{p['id']}", headers=exec_headers)
    assert r.status_code == 403


def test_list_projects_search_filter(auth_client):
    client, headers = auth_client
    client.post("/api/projects", json={"name": "Alpha Project"}, headers=headers)
    client.post("/api/projects", json={"name": "Beta Project"}, headers=headers)
    r = client.get("/api/projects", params={"search": "Alpha"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Alpha Project"


def test_list_projects_pagination(auth_client):
    client, headers = auth_client
    for i in range(5):
        client.post("/api/projects", json={"name": f"Project {i}"}, headers=headers)
    r = client.get("/api/projects", params={"page": 1, "page_size": 2}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3

    r2 = client.get("/api/projects", params={"page": 2, "page_size": 2}, headers=headers)
    body2 = r2.json()
    assert len(body2["items"]) == 2
    assert {i["id"] for i in body["items"]}.isdisjoint({i["id"] for i in body2["items"]})
