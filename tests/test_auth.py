def test_register(client):
    r = client.post("/api/auth/register", json={
        "username": "alice", "email": "alice@example.com", "password": "secret",
    })
    assert r.status_code == 201
    data = r.json()
    assert "access_token" in data
    assert data["user"]["username"] == "alice"


def test_register_duplicate_username(client):
    payload = {"username": "bob", "email": "bob@example.com", "password": "secret"}
    client.post("/api/auth/register", json=payload)
    r = client.post("/api/auth/register", json={**payload, "email": "bob2@example.com"})
    assert r.status_code == 400


def test_register_duplicate_email(client):
    client.post("/api/auth/register", json={"username": "carol", "email": "carol@example.com", "password": "secret"})
    r = client.post("/api/auth/register", json={"username": "carol2", "email": "carol@example.com", "password": "secret"})
    assert r.status_code == 400


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


def test_protected_without_token(client):
    r = client.get("/api/projects")
    assert r.status_code == 401
