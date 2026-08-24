"""services/common/request_id.py — correlation ID minting/forwarding on
inbound requests, and its propagation into outgoing inter-service calls
via services/common/http.py.
"""
import logging
import re

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.common.http import get_with_retry, request_id_headers
from services.common.request_id import (
    REQUEST_ID_HEADER,
    RequestIDMiddleware,
    current_request_id,
)

UUID4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I
)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware, logger=logging.getLogger("test-request-id"))

    @app.get("/whoami")
    def whoami():
        return {"request_id": current_request_id()}

    @app.get("/call-downstream")
    def call_downstream():
        resp = get_with_retry("http://downstream/x")
        return {"downstream_saw": resp.json()}

    return app


@pytest.fixture()
def client():
    with TestClient(_build_app()) as c:
        yield c


def test_mints_a_new_request_id_when_none_provided(client):
    res = client.get("/whoami")
    assert res.status_code == 200
    minted = res.json()["request_id"]
    assert UUID4_RE.match(minted), f"{minted!r} doesn't look like a UUID4"
    assert res.headers[REQUEST_ID_HEADER] == minted


def test_forwards_the_callers_request_id_unchanged(client):
    res = client.get("/whoami", headers={REQUEST_ID_HEADER: "caller-supplied-id"})
    assert res.json()["request_id"] == "caller-supplied-id"
    assert res.headers[REQUEST_ID_HEADER] == "caller-supplied-id"


def test_request_id_is_isolated_between_requests(client):
    first = client.get("/whoami").json()["request_id"]
    second = client.get("/whoami").json()["request_id"]
    assert first != second


def test_current_request_id_is_none_outside_a_request():
    assert current_request_id() is None
    assert request_id_headers() == {}


def test_get_with_retry_propagates_the_current_request_id(client, monkeypatch):
    """The whole point of threading this id: a call one service makes to
    another during request handling must carry the same id the inbound
    request arrived with (or was minted for), not a fresh one."""
    captured = {}

    class _FakeResponse:
        status_code = 200

        def json(self):
            return captured

    def _get(url, timeout=None, headers=None, **kwargs):
        captured.update(headers or {})
        return _FakeResponse()

    monkeypatch.setattr(httpx, "get", _get)
    res = client.get("/call-downstream", headers={REQUEST_ID_HEADER: "propagate-me"})
    assert res.json()["downstream_saw"].get(REQUEST_ID_HEADER) == "propagate-me"
