"""shared/schemas.py — the schemas unified between the monolith and the
microservices (see that module's docstring). These tests pin the two real
bugs found and fixed by unifying: services/auth's TokenResponse was missing
`token_type`, and services/auth, services/projects, services/runs all
serialized datetimes without a UTC offset (the same OpenAPI
`format: date-time` violation tests/contract/ had already caught and fixed
in the monolith alone).
"""
import os
import re

import httpx as httpx_module
from fastapi.testclient import TestClient

from conftest import import_service_app, reset_db, mint_token

os.environ.setdefault("PROJECTS_SERVICE_URL", "http://127.0.0.1:1")  # connection-refused

ISO_UTC_OFFSET = re.compile(r"(Z|[+-]\d{2}:\d{2})$")


def test_auth_login_response_includes_token_type():
    app, db_mod = import_service_app("auth")
    reset_db(db_mod)
    with TestClient(app) as client:
        client.post("/api/auth/register", json={
            "username": "tokentype", "email": "tt@example.com", "password": "pass1234",
        })
        res = client.post("/api/auth/login", json={"username": "tokentype", "password": "pass1234"})
    assert res.json()["token_type"] == "bearer"


def test_auth_response_datetimes_include_utc_offset():
    app, db_mod = import_service_app("auth")
    reset_db(db_mod)
    with TestClient(app) as client:
        res = client.post("/api/auth/register", json={
            "username": "utcuser", "email": "utc@example.com", "password": "pass1234",
        })
    created_at = res.json()["user"]["created_at"]
    assert ISO_UTC_OFFSET.search(created_at), f"{created_at!r} has no UTC offset/Z suffix"


def test_projects_response_datetimes_include_utc_offset():
    app, db_mod = import_service_app("projects")
    reset_db(db_mod)
    headers = {"Authorization": f"Bearer {mint_token(1, 'admin')}"}
    with TestClient(app) as client:
        res = client.post("/api/projects", json={"name": "P"}, headers=headers)
    created_at = res.json()["created_at"]
    assert ISO_UTC_OFFSET.search(created_at), f"{created_at!r} has no UTC offset/Z suffix"


def test_runs_response_datetimes_include_utc_offset(monkeypatch):
    app, db_mod = import_service_app("runs")
    reset_db(db_mod)
    headers = {"Authorization": f"Bearer {mint_token(1, 'admin')}"}

    class _FakeResponse:
        status_code = 200

        def json(self):
            return [{"id": 1}]

    monkeypatch.setattr(httpx_module, "get", lambda url, timeout=None, **kwargs: _FakeResponse())

    with TestClient(app) as client:
        res = client.post("/api/suites/1/runs", json={"name": "Run 1"}, headers=headers)
    created_at = res.json()["created_at"]
    assert ISO_UTC_OFFSET.search(created_at), f"{created_at!r} has no UTC offset/Z suffix"
