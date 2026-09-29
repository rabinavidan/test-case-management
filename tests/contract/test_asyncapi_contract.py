"""Contract tests: the run-collaboration WebSocket's real server messages
validated against the message schemas in docs/asyncapi.yaml — the
WebSocket counterpart of test_openapi_contract.py. If the server starts
sending a field the contract doesn't declare (or drops a required one),
this fails instead of silently breaking static/app.js or a test client.
"""
import json
import os
import pathlib

import jsonschema
import pytest
import yaml
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from api.database import Base, get_db
from api.main import app

SPEC_PATH = pathlib.Path(__file__).resolve().parents[2] / "docs" / "asyncapi.yaml"
SPEC = yaml.safe_load(SPEC_PATH.read_text())
MESSAGES = SPEC["components"]["messages"]

_WORKER_ID = os.environ.get("PYTEST_XDIST_WORKER", "master")
engine = create_engine(f"sqlite:///./asyncapi_test_{_WORKER_ID}.db", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _assert_matches(message_name, payload):
    jsonschema.validate(payload, MESSAGES[message_name]["payload"])


@pytest.fixture()
def ctx():
    """(client, token, run_id, testcase_id) against a fresh DB."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as client:
            client.post("/api/auth/register", json={
                "username": "asyncapi", "email": "asyncapi@example.com", "password": "asyncapipass1"})
            token = client.post("/api/auth/login", json={
                "username": "asyncapi", "password": "asyncapipass1"}).json()["access_token"]
            h = {"Authorization": f"Bearer {token}"}
            p = client.post("/api/projects", json={"name": "P"}, headers=h).json()
            s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "S"}, headers=h).json()
            tc = client.post(f"/api/suites/{s['id']}/testcases",
                             json={"title": "TC", "status": "active"}, headers=h).json()
            run = client.post(f"/api/suites/{s['id']}/runs", json={"name": "R"}, headers=h).json()
            yield client, token, run["id"], tc["id"]
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_spec_is_asyncapi_3_and_every_message_has_a_schema():
    assert SPEC["asyncapi"].startswith("3.")
    for name, message in MESSAGES.items():
        jsonschema.Draft202012Validator.check_schema(message["payload"])
        assert name in {ref["$ref"].rsplit("/", 1)[-1] for ref in SPEC["channels"]["run"]["messages"].values()}


def test_pong_matches_contract(ctx):
    client, token, run_id, _ = ctx
    with client.websocket_connect(f"/ws/runs/{run_id}?token={token}") as ws:
        ws.send_text(json.dumps({"type": "ping"}))
        _assert_matches("pong", ws.receive_json())
        ws.send_text("ping")
        _assert_matches("legacyPong", ws.receive_text())


def test_error_matches_contract(ctx):
    client, token, run_id, _ = ctx
    with client.websocket_connect(f"/ws/runs/{run_id}?token={token}") as ws:
        ws.send_text("{not json")
        _assert_matches("error", ws.receive_json())


@pytest.mark.parametrize("body", [
    {"status": "pass", "notes": "ok"},
    {"status": "fail"},  # notes omitted -> null on the wire
])
def test_result_updated_matches_contract(ctx, body):
    client, token, run_id, tc_id = ctx
    with client.websocket_connect(f"/ws/runs/{run_id}?token={token}") as ws:
        client.put(f"/api/runs/{run_id}/results/{tc_id}", json=body,
                   headers={"Authorization": f"Bearer {token}"})
        _assert_matches("resultUpdated", ws.receive_json())


def test_contract_rejects_an_undeclared_field():
    """Guards the guard: additionalProperties: false really is enforced."""
    with pytest.raises(jsonschema.ValidationError):
        _assert_matches("resultsPopulated", {"type": "results_populated", "run_id": 1, "extra": True})
