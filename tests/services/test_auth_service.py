"""services/auth — register/login bootstrap, JWT issuing, admin-only user management."""
import pytest
from fastapi.testclient import TestClient

from conftest import import_service_app, reset_db

app, db_mod = import_service_app("auth")


@pytest.fixture(autouse=True)
def _reset():
    reset_db(db_mod)
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "auth"}


def test_setup_needed_before_first_register(client):
    assert client.get("/api/auth/setup").json() == {"setup_needed": True}


def test_register_first_user_becomes_admin(client):
    res = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["role"] == "admin"
    assert body["access_token"]

    assert client.get("/api/auth/setup").json() == {"setup_needed": False}


def test_register_second_user_is_rejected(client):
    client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    res = client.post("/api/auth/register", json={
        "username": "intruder", "email": "intruder@example.com", "password": "somepass1",
    })
    assert res.status_code == 403


def test_register_rejects_short_password(client):
    res = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "short",
    })
    assert res.status_code == 400


def test_login_success_and_wrong_password(client):
    client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    ok = client.post("/api/auth/login", json={"username": "admin", "password": "adminpass1"})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    bad = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-pass"})
    assert bad.status_code == 401


def test_login_deactivated_account_is_rejected(client):
    client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    login = client.post("/api/auth/login", json={"username": "admin", "password": "adminpass1"})
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = client.post("/api/users", json={
        "username": "exec1", "email": "exec1@example.com", "password": "execpass1",
    }, headers=admin_headers)
    user_id = created.json()["id"]

    client.patch(f"/api/users/{user_id}/status", headers=admin_headers)  # deactivate
    res = client.post("/api/auth/login", json={"username": "exec1", "password": "execpass1"})
    assert res.status_code == 403


def test_me_returns_current_user(client):
    register = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["username"] == "admin"


def test_me_without_token_is_unauthorized(client):
    assert client.get("/api/auth/me").status_code == 401


def test_admin_can_create_and_list_and_delete_executor(client):
    register = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    admin_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    created = client.post("/api/users", json={
        "username": "exec1", "email": "exec1@example.com", "password": "execpass1",
    }, headers=admin_headers)
    assert created.status_code == 201
    assert created.json()["role"] == "executor"

    listed = client.get("/api/users", headers=admin_headers)
    assert len(listed.json()) == 2

    deleted = client.delete(f"/api/users/{created.json()['id']}", headers=admin_headers)
    assert deleted.status_code == 204


def test_executor_cannot_manage_users(client):
    register = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    admin_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    exec_res = client.post("/api/users", json={
        "username": "exec1", "email": "exec1@example.com", "password": "execpass1",
    }, headers=admin_headers)
    assert exec_res.status_code == 201
    exec_login = client.post("/api/auth/login", json={"username": "exec1", "password": "execpass1"})
    exec_headers = {"Authorization": f"Bearer {exec_login.json()['access_token']}"}

    assert client.get("/api/users", headers=exec_headers).status_code == 403
    assert client.post("/api/users", json={
        "username": "exec2", "email": "exec2@example.com", "password": "execpass1",
    }, headers=exec_headers).status_code == 403


def test_admin_cannot_delete_or_deactivate_self(client):
    register = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    admin_id = register.json()["user"]["id"]
    admin_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    assert client.delete(f"/api/users/{admin_id}", headers=admin_headers).status_code == 400
    assert client.patch(f"/api/users/{admin_id}/status", headers=admin_headers).status_code == 400


def test_duplicate_username_and_email_rejected(client):
    register = client.post("/api/auth/register", json={
        "username": "admin", "email": "admin@example.com", "password": "adminpass1",
    })
    admin_headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    client.post("/api/users", json={
        "username": "exec1", "email": "exec1@example.com", "password": "execpass1",
    }, headers=admin_headers)

    dup_username = client.post("/api/users", json={
        "username": "exec1", "email": "different@example.com", "password": "execpass1",
    }, headers=admin_headers)
    assert dup_username.status_code == 400

    dup_email = client.post("/api/users", json={
        "username": "different", "email": "exec1@example.com", "password": "execpass1",
    }, headers=admin_headers)
    assert dup_email.status_code == 400
