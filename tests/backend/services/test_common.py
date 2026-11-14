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


def test_database_check_reports_reachable_and_unreachable(tmp_path):
    from sqlalchemy import create_engine
    from services.common.health import database_check
    assert database_check(create_engine(f"sqlite:///{tmp_path / 'ok.db'}"))() is True
    assert database_check(create_engine("sqlite:////nonexistent-dir/unreachable.db"))() is False


def test_readiness_response_is_503_if_any_check_fails():
    import json
    from services.common.health import readiness_response
    ok = readiness_response("svc", {"database": lambda: True})
    assert ok.status_code == 200
    assert json.loads(ok.body) == {"status": "ok", "service": "svc", "checks": {"database": "ok"}}
    bad = readiness_response("svc", {"database": lambda: True, "other": lambda: False})
    assert bad.status_code == 503
    assert json.loads(bad.body)["checks"] == {"database": "ok", "other": "fail"}


def test_heartbeat_fresh_after_touch_stale_when_old_or_missing(tmp_path):
    import os
    from services.common.heartbeat import heartbeat_is_fresh, main, touch_heartbeat
    path = str(tmp_path / "hb")
    assert heartbeat_is_fresh(path, 60) is False
    assert main([path, "60"]) == 1
    touch_heartbeat(path)
    assert heartbeat_is_fresh(path, 60) is True
    assert main([path, "60"]) == 0
    old = time.time() - 120
    os.utime(path, (old, old))
    assert heartbeat_is_fresh(path, 60) is False


def test_touch_heartbeat_never_raises_on_unwritable_path():
    from services.common.heartbeat import touch_heartbeat
    touch_heartbeat("/nonexistent-dir/hb")  # must not raise


def test_health_module_imports_without_sqlalchemy():
    """services/ai imports services.common.health but its image doesn't
    install sqlalchemy (no database) — a top-level sqlalchemy import there
    crashed ai on boot."""
    import subprocess
    import sys
    code = (
        "import sys; sys.modules['sqlalchemy'] = None\n"
        "from services.common.health import health_response\n"
        "assert health_response('ai') == {'status': 'ok', 'service': 'ai'}\n"
    )
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
