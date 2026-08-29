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
    body = r.json()
    entries = body["items"]
    assert any(e["path"] == "/api/projects" for e in entries)
    assert all(e["level"] in ("info", "warning", "error") for e in entries)
    assert all(e["source"] in ("server", "client") for e in entries)


def test_list_logs_is_paginated(auth_client):
    client, headers = auth_client
    for _ in range(30):
        client.get("/api/projects", headers=headers)

    r = client.get("/api/logs?page=1&page_size=25", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 25
    assert body["page"] == 1
    assert body["page_size"] == 25
    assert body["total"] >= 30
    assert body["total_pages"] >= 2

    # Fetching page 1 above itself logged a new row (the request-logging
    # middleware logs every request, including calls to /api/logs), which can
    # shift a strict offset window by one — so this only checks page 2 is
    # populated and independently well-formed, not that the two pages share
    # no ids.
    r2 = client.get("/api/logs?page=2&page_size=25", headers=headers)
    assert r2.status_code == 200
    page2 = r2.json()
    assert len(page2["items"]) > 0
    assert page2["page"] == 2


def test_list_logs_defaults_to_25_per_page(auth_client):
    client, headers = auth_client
    for _ in range(30):
        client.get("/api/projects", headers=headers)

    r = client.get("/api/logs", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["page_size"] == 25
    assert len(body["items"]) == 25


def test_list_logs_filters_by_level(auth_client):
    client, headers = auth_client
    client.get("/api/nonexistent-route-xyz", headers=headers)  # 404 -> warning
    r = client.get("/api/logs?level=warning", headers=headers)
    assert r.status_code == 200
    assert all(e["level"] == "warning" for e in r.json()["items"])


def test_list_logs_filters_by_search(auth_client):
    client, headers = auth_client
    client.get("/api/environments", headers=headers)
    r = client.get("/api/logs?search=environments", headers=headers)
    assert r.status_code == 200
    assert all("environments" in e["message"].lower() for e in r.json()["items"])


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
    entries = r.json()["items"]
    assert len(entries) == 1
    assert entries[0]["source"] == "client"
    assert entries[0]["level"] == "error"


def test_submit_client_log_rejects_missing_message(client):
    r = client.post("/api/logs/client", json={"url": "https://x/"})
    assert r.status_code == 422
