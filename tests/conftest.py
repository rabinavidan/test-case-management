import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.database import Base, get_db
from api.main import app

DATABASE_URL = "sqlite:///./test.db"

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
    """Executor client (second registered user); returns (client, headers)."""
    client.post("/api/auth/register", json={
        "username": "executor",
        "email": "executor@example.com",
        "password": "execpass",
    })
    res = client.post("/api/auth/login", json={
        "username": "executor",
        "password": "execpass",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers
