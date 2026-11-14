def test_create_executor_duplicate_username(auth_client):
    client, headers = auth_client
    client.post("/api/users", json={
        "username": "dup", "email": "dup1@example.com", "password": "execpass",
    }, headers=headers)
    r = client.post("/api/users", json={
        "username": "dup", "email": "dup2@example.com", "password": "execpass",
    }, headers=headers)
    assert r.status_code == 400


def test_create_executor_duplicate_email(auth_client):
    client, headers = auth_client
    client.post("/api/users", json={
        "username": "user1", "email": "shared@example.com", "password": "execpass",
    }, headers=headers)
    r = client.post("/api/users", json={
        "username": "user2", "email": "shared@example.com", "password": "execpass",
    }, headers=headers)
    assert r.status_code == 400


def test_create_executor_password_too_short(auth_client):
    client, headers = auth_client
    r = client.post("/api/users", json={
        "username": "shortpw", "email": "shortpw@example.com", "password": "abc",
    }, headers=headers)
    assert r.status_code == 400


def test_executor_cannot_create_user(executor_client):
    client, headers = executor_client
    r = client.post("/api/users", json={
        "username": "nope", "email": "nope@example.com", "password": "execpass",
    }, headers=headers)
    assert r.status_code == 403


def test_delete_user(auth_client):
    client, headers = auth_client
    created = client.post("/api/users", json={
        "username": "todelete", "email": "todelete@example.com", "password": "execpass",
    }, headers=headers).json()
    r = client.delete(f"/api/users/{created['id']}", headers=headers)
    assert r.status_code == 204
    users = client.get("/api/users", headers=headers).json()
    assert all(u["id"] != created["id"] for u in users)


def test_delete_user_not_found(auth_client):
    client, headers = auth_client
    r = client.delete("/api/users/999", headers=headers)
    assert r.status_code == 404


def test_delete_own_account_forbidden(auth_client):
    client, headers = auth_client
    me = client.get("/api/auth/me", headers=headers).json()
    r = client.delete(f"/api/users/{me['id']}", headers=headers)
    assert r.status_code == 400


def test_executor_cannot_delete_user(executor_client):
    client, headers = executor_client
    r = client.delete("/api/users/1", headers=headers)
    assert r.status_code == 403


def test_toggle_user_status(auth_client):
    client, headers = auth_client
    created = client.post("/api/users", json={
        "username": "togglee", "email": "togglee@example.com", "password": "execpass",
    }, headers=headers).json()
    assert created["is_active"] is True

    r = client.patch(f"/api/users/{created['id']}/status", headers=headers)
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r = client.patch(f"/api/users/{created['id']}/status", headers=headers)
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_toggle_user_status_not_found(auth_client):
    client, headers = auth_client
    r = client.patch("/api/users/999/status", headers=headers)
    assert r.status_code == 404


def test_toggle_own_status_forbidden(auth_client):
    client, headers = auth_client
    me = client.get("/api/auth/me", headers=headers).json()
    r = client.patch(f"/api/users/{me['id']}/status", headers=headers)
    assert r.status_code == 400


def test_executor_cannot_toggle_status(executor_client):
    client, headers = executor_client
    r = client.patch("/api/users/1/status", headers=headers)
    assert r.status_code == 403
