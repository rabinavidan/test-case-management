import pytest
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
    # parents[2] is the repo root; this used to look for tests/static, which
    # never exists, so the test returned early and checked nothing.
    assert (pathlib.Path(__file__).resolve().parents[2] / "static" / "app.js").exists()
    r = client.get("/static/app.js")
    assert r.status_code == 200
    assert "javascript" in r.headers["content-type"]


@pytest.mark.parametrize("path", ["/api/does-not-exist", "/api/projects/1/nope"])
def test_unknown_api_route_is_a_json_404_not_the_spa(client, path):
    r = client.get(path)
    assert r.status_code == 404
    assert r.json() == {"detail": "Not Found"}


@pytest.mark.parametrize("path", ["/missing.js", "/favicon.ico", "/_vercel/insights/script.js", "/static/missing.js"])
def test_missing_file_is_a_404_not_the_spa(client, path):
    r = client.get(path)
    assert r.status_code == 404
    assert "<html" not in r.text.lower()


def test_vercel_analytics_tags_only_on_vercel(client, monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    assert "/_vercel/" not in client.get("/").text
    monkeypatch.setenv("VERCEL", "1")
    page = client.get("/").text
    assert '<script defer src="/_vercel/insights/script.js"></script>' in page
    assert '<script defer src="/_vercel/speed-insights/script.js"></script>' in page


def test_static_app_js_is_gzipped(client):
    # The SPA bundle is the largest thing on the homepage's critical path.
    app_js = pathlib.Path(__file__).resolve().parents[2] / "static" / "app.js"
    assert app_js.exists()
    r = client.get("/static/app.js", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    # Bytes, not text: read_text() normalizes CRLF while the server sends the
    # file as-is, so a text comparison fails on an autocrlf (Windows) checkout.
    assert r.content == app_js.read_bytes()


def test_small_json_response_not_gzipped(client):
    r = client.get("/api/version", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert "content-encoding" not in r.headers
