"""Fixtures for the API layer: a per-worker throwaway SQLite DB (tables
dropped and recreated before/after every test) wired into the FastAPI app
via dependency override, plus authenticated TestClient helpers.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.database import Base, get_db
from api.main import app, _ENVIRONMENT_SEED
from api import models

# Suffixed with the pytest-xdist worker ID ("gw0", "gw1", ... or "master"
# outside xdist) so parallel workers — separate OS processes, each with
# their own copy of this module-level `engine` — never share one SQLite
# file. Without this, concurrent create_all/drop_all calls from different
# workers race against the same file on disk.
_WORKER_ID = os.environ.get("PYTEST_XDIST_WORKER", "master")
DATABASE_URL = f"sqlite:///./test_{_WORKER_ID}.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    # Mirrors the app's own startup seeding (api.main._seed_environments),
    # against this test's own engine rather than the app's real one.
    db = TestingSessionLocal()
    db.add_all(models.Environment(**env) for env in _ENVIRONMENT_SEED)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_client(client):
    """Admin client (first registered user); returns (client, headers)."""
    client.post("/api/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpass",
    })
    res = client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "testpass",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest.fixture()
def executor_client(client, auth_client):
    """Executor client (created by admin); returns (client, headers)."""
    _, admin_headers = auth_client
    client.post("/api/users", json={
        "username": "executor",
        "email": "executor@example.com",
        "password": "execpass",
    }, headers=admin_headers)
    res = client.post("/api/auth/login", json={
        "username": "executor",
        "password": "execpass",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers
