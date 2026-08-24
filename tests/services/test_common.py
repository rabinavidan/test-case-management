"""services/common/ — the shared library extracted to stop the class of bug
where identical logic (worst offender: JWT padding math) was duplicated
across every microservice. Tested directly, not just indirectly through
each service's own test file.
"""
import time

import pytest
from fastapi import HTTPException

from services.common.jwt import encode_token, decode_token, _b64d, _b64e
from services.common.health import health_response

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
