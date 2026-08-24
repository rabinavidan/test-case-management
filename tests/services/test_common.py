"""services/common/ — the shared library extracted to stop the class of bug
where identical logic (worst offender: JWT padding math) was duplicated
across every microservice. Tested directly, not just indirectly through
each service's own test file.
"""
import time

import httpx
import pytest
from fastapi import HTTPException

from services.common.jwt import encode_token, decode_token, _b64d, _b64e
from services.common.health import health_response
from services.common.http import get_with_retry, DEFAULT_TIMEOUT, MAX_ATTEMPTS

SECRET = b"test-secret"


def test_encode_then_decode_round_trips():
    token = encode_token({"sub": "1", "role": "admin", "exp": int(time.time()) + 3600}, SECRET)
    data = decode_token(token, SECRET)
    assert data["sub"] == "1"
    assert data["role"] == "admin"


def test_decode_rejects_tampered_signature():
    token = encode_token({"sub": "1", "role": "admin", "exp": int(time.time()) + 3600}, SECRET)
    header, payload, sig = token.split(".")
    tampered = f"{header}.{payload}.{sig[:-1]}x"
    with pytest.raises(HTTPException) as exc_info:
        decode_token(tampered, SECRET)
    assert exc_info.value.status_code == 401


def test_decode_rejects_wrong_secret():
    token = encode_token({"sub": "1", "role": "admin", "exp": int(time.time()) + 3600}, SECRET)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token, b"a-different-secret")
    assert exc_info.value.status_code == 401


def test_decode_rejects_expired_token():
    token = encode_token({"sub": "1", "role": "admin", "exp": int(time.time()) - 10}, SECRET)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token, SECRET)
    assert exc_info.value.status_code == 401


def test_decode_rejects_malformed_token():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not-a-real-token", SECRET)
    assert exc_info.value.status_code == 401


@pytest.mark.parametrize("payload_len", range(20))
def test_b64_round_trips_regardless_of_padding_needed(payload_len):
    """Regression test for the exact bug this module exists to prevent: the
    old `"=" * (4 - len(s) % 4) % 4` crashed (TypeError) whenever padding
    was actually needed. Sweep enough lengths to hit every padding case
    (0/1/2/3 chars short of a multiple of 4)."""
    original = b"x" * payload_len
    encoded = _b64e(original)
    assert _b64d(encoded) == original


def test_health_response_shape():
    assert health_response("auth") == {"status": "ok", "service": "auth"}
    assert health_response("projects") == {"status": "ok", "service": "projects"}


class _FakeResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code


def test_get_with_retry_succeeds_first_try_makes_one_call(monkeypatch):
    calls = []

    def _get(url, timeout=None, **kwargs):
        calls.append(url)
        return _FakeResponse(200)

    monkeypatch.setattr(httpx, "get", _get)
    resp = get_with_retry("http://svc/x")
    assert resp.status_code == 200
    assert len(calls) == 1


def test_get_with_retry_recovers_after_transient_connect_errors(monkeypatch):
    attempts = {"n": 0}

    def _get(url, timeout=None, **kwargs):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise httpx.ConnectError("connection refused", request=None)
        return _FakeResponse(200)

    monkeypatch.setattr(httpx, "get", _get)
    monkeypatch.setattr(time, "sleep", lambda seconds: None)
    resp = get_with_retry("http://svc/x")
    assert resp.status_code == 200
    assert attempts["n"] == 3


def test_get_with_retry_gives_up_after_max_attempts(monkeypatch):
    attempts = {"n": 0}

    def _get(url, timeout=None, **kwargs):
        attempts["n"] += 1
        raise httpx.ConnectError("connection refused", request=None)

    monkeypatch.setattr(httpx, "get", _get)
    monkeypatch.setattr(time, "sleep", lambda seconds: None)
    with pytest.raises(httpx.ConnectError):
        get_with_retry("http://svc/x")
    assert attempts["n"] == MAX_ATTEMPTS


def test_get_with_retry_does_not_retry_a_real_response(monkeypatch):
    """A 404 (or any status code) is a real answer from the service, not a
    connectivity blip — must not be retried, and must be returned as-is so
    callers can branch on it (e.g. `if resp.status_code == 404: raise ...`)."""
    calls = []

    def _get(url, timeout=None, **kwargs):
        calls.append(url)
        return _FakeResponse(404)

    monkeypatch.setattr(httpx, "get", _get)
    resp = get_with_retry("http://svc/x")
    assert resp.status_code == 404
    assert len(calls) == 1


def test_get_with_retry_does_not_retry_non_transient_exceptions(monkeypatch):
    """Only connection/timeout errors are retried — anything else (e.g. a
    genuine bug on the caller's side) must propagate immediately, not be
    silently retried into a slower failure."""
    calls = []

    def _get(url, timeout=None, **kwargs):
        calls.append(url)
        raise ValueError("not a connectivity problem")

    monkeypatch.setattr(httpx, "get", _get)
    with pytest.raises(ValueError):
        get_with_retry("http://svc/x")
    assert len(calls) == 1


def test_get_with_retry_omits_params_kwarg_when_not_given(monkeypatch):
    """Some call sites (and their tests) call the underlying httpx.get with
    no `params` kwarg at all — get_with_retry must not force one in, or it
    would break a mock with a narrower signature than httpx.get's real one."""
    def _get(url, timeout=None, **kwargs):
        return _FakeResponse(200)

    monkeypatch.setattr(httpx, "get", _get)
    resp = get_with_retry("http://svc/x", timeout=DEFAULT_TIMEOUT)
    assert resp.status_code == 200
