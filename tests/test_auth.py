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
