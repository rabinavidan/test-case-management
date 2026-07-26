import pathlib


def test_debug_seed_defaults(client, monkeypatch):
    monkeypatch.delenv("SEED_ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    r = client.get("/api/debug/seed")
    assert r.status_code == 200
    data = r.json()
    assert data["env_username_set"] is False
    assert data["env_password_set"] is False
    assert data["admin_exists"] is False
    assert data["seed_error"] is None


def test_debug_seed_creates_admin_from_env(client, monkeypatch):
    monkeypatch.setenv("SEED_ADMIN_USERNAME", "envadmin")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "envpass1")
    r = client.get("/api/debug/seed")
    assert r.status_code == 200
    data = r.json()
    assert data["env_username_set"] is True
    assert data["env_password_set"] is True
    assert data.get("seeded") is True

    login = client.post("/api/auth/login", json={"username": "envadmin", "password": "envpass1"})
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "admin"


def test_root_serves_spa_index(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]


def test_unknown_path_falls_back_to_spa_index(client):
    r = client.get("/some/deep/client-side-route")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]


def test_static_assets_served(client):
    static_dir = pathlib.Path(__file__).parent.parent / "static"
    if not (static_dir / "app.js").exists():
        return
    r = client.get("/static/app.js")
    assert r.status_code == 200
