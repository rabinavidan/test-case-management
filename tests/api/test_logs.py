

def test_list_logs_requires_admin(client, executor_client):
    _, exec_headers = executor_client
    r = client.get("/api/logs", headers=exec_headers)
    assert r.status_code == 403


def test_list_logs_requires_auth(client):
    r = client.get("/api/logs")
    assert r.status_code == 401


def test_list_logs_returns_recorded_activity(auth_client):
    client, headers = auth_client
    client.get("/api/projects", headers=headers)  # generates a request-log entry
    r = client.get("/api/logs", headers=headers)
    assert r.status_code == 200
    entries = r.json()
    assert any(e["path"] == "/api/projects" for e in entries)
    assert all(e["level"] in ("info", "warning", "error") for e in entries)
    assert all(e["source"] in ("server", "client") for e in entries)


def test_list_logs_filters_by_level(auth_client):
    client, headers = auth_client
    client.get("/api/nonexistent-route-xyz", headers=headers)  # 404 -> warning
    r = client.get("/api/logs?level=warning", headers=headers)
    assert r.status_code == 200
    assert all(e["level"] == "warning" for e in r.json())


def test_list_logs_filters_by_search(auth_client):
    client, headers = auth_client
    client.get("/api/environments", headers=headers)
    r = client.get("/api/logs?search=environments", headers=headers)
    assert r.status_code == 200
    assert all("environments" in e["message"].lower() for e in r.json())


def test_submit_client_log_does_not_require_auth(client):
    r = client.post("/api/logs/client", json={
        "message": "TypeError: x is not a function", "stack": "at foo (app.js:1)", "url": "https://x/#projects",
    })
    assert r.status_code == 201


def test_client_log_appears_in_log_list(auth_client):
    client, headers = auth_client
    client.post("/api/logs/client", json={"message": "unique-client-error-marker"})
    r = client.get("/api/logs?source=client&search=unique-client-error-marker", headers=headers)
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["source"] == "client"
    assert entries[0]["level"] == "error"


def test_submit_client_log_rejects_missing_message(client):
    r = client.post("/api/logs/client", json={"url": "https://x/"})
    assert r.status_code == 422
