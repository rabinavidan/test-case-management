def test_register_first_user_becomes_admin(client):
    r = client.post("/api/auth/register", json={
        "username": "alice", "email": "alice@example.com", "password": "secret",
    })
    assert r.status_code == 201
    data = r.json()
    assert "access_token" in data
    assert data["user"]["username"] == "alice"
    assert data["user"]["role"] == "admin"


def test_register_closed_after_first_user(client):
    client.post("/api/auth/register", json={
        "username": "alice", "email": "alice@example.com", "password": "secret",
    })
    r = client.post("/api/auth/register", json={
        "username": "bob", "email": "bob@example.com", "password": "secret",
    })
    assert r.status_code == 403


def test_login(client):
    client.post("/api/auth/register", json={"username": "dave", "email": "dave@example.com", "password": "secret"})
    r = client.post("/api/auth/login", json={"username": "dave", "password": "secret"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"username": "eve", "email": "eve@example.com", "password": "secret"})
    r = client.post("/api/auth/login", json={"username": "eve", "password": "wrong"})
    assert r.status_code == 401


def test_me(auth_client):
    client, headers = auth_client
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["username"] == "testuser"
    assert r.json()["role"] == "admin"


def test_protected_without_token(client):
    r = client.post("/api/projects", json={"name": "No Auth"})
    assert r.status_code == 401


def test_admin_can_create_executor_via_api(auth_client):
    client, headers = auth_client
    r = client.post("/api/users", json={
        "username": "exec1", "email": "exec1@example.com", "password": "execpass",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["role"] == "executor"


def test_executor_cannot_create_project(executor_client):
    client, headers = executor_client
    r = client.post("/api/projects", json={"name": "No Permission"}, headers=headers)
    assert r.status_code == 403


def test_admin_can_create_project(auth_client):
    client, headers = auth_client
    r = client.post("/api/projects", json={"name": "Admin Project"}, headers=headers)
    assert r.status_code == 201


def test_admin_can_list_users(auth_client):
    client, headers = auth_client
    r = client.get("/api/users", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_executor_cannot_list_users(executor_client):
    client, headers = executor_client
    r = client.get("/api/users", headers=headers)
    assert r.status_code == 403


def test_version_endpoint(client):
    r = client.get("/api/version")
    assert r.status_code == 200
    assert "version" in r.json()


def test_setup_status_needed_before_any_user(client):
    r = client.get("/api/auth/setup")
    assert r.status_code == 200
    assert r.json()["setup_needed"] is True


def test_setup_status_not_needed_after_register(auth_client):
    client, _ = auth_client
    r = client.get("/api/auth/setup")
    assert r.status_code == 200
    assert r.json()["setup_needed"] is False


def test_register_password_too_short(client):
    r = client.post("/api/auth/register", json={
        "username": "shortpw", "email": "shortpw@example.com", "password": "abc",
    })
    assert r.status_code == 400


def test_login_nonexistent_user(client):
    r = client.post("/api/auth/login", json={"username": "ghost", "password": "whatever"})
    assert r.status_code == 401


def test_login_deactivated_account(auth_client):
    client, headers = auth_client
    r = client.post("/api/users", json={
        "username": "deactivated", "email": "deactivated@example.com", "password": "execpass",
    }, headers=headers)
    user_id = r.json()["id"]
    client.patch(f"/api/users/{user_id}/status", headers=headers)  # toggle to inactive
    r = client.post("/api/auth/login", json={"username": "deactivated", "password": "execpass"})
    assert r.status_code == 403


def test_malformed_token_rejected(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-valid-token"})
    assert r.status_code == 401


def test_tampered_token_rejected(auth_client):
    client, headers = auth_client
    token = headers["Authorization"].split(" ")[1]
    header, payload, sig = token.split(".")
    tampered = f"{header}.{payload}.{sig[:-1]}{'a' if sig[-1] != 'a' else 'b'}"
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code == 401


def test_expired_token_rejected(client, monkeypatch):
    import time
    from api import auth as auth_module

    client.post("/api/auth/register", json={
        "username": "expiretest", "email": "expiretest@example.com", "password": "secret",
    })

    real_time = time.time
    monkeypatch.setattr(auth_module.time, "time", lambda: real_time() - auth_module.ACCESS_TOKEN_EXPIRE_SECONDS - 10)
    login = client.post("/api/auth/login", json={"username": "expiretest", "password": "secret"})
    monkeypatch.setattr(auth_module.time, "time", real_time)

    token = login.json()["access_token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_token_for_deleted_user_rejected(auth_client):
    client, admin_headers = auth_client
    r = client.post("/api/users", json={
        "username": "todelete", "email": "todelete@example.com", "password": "execpass",
    }, headers=admin_headers)
    user_id = r.json()["id"]
    login = client.post("/api/auth/login", json={"username": "todelete", "password": "execpass"})
    token = login.json()["access_token"]

    client.delete(f"/api/users/{user_id}", headers=admin_headers)

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
