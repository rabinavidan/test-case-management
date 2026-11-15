"""Unit tests for api/auth.py — pure functions only, no DB, no HTTP, no TestClient.

This is the bottom of the test pyramid: fast, deterministic, and isolated
from the FastAPI app and SQLAlchemy so failures point straight at the
token/hashing logic rather than at wiring.
"""
import time

import pytest
from fastapi import HTTPException

from api import auth


def test_hash_password_produces_a_verifiable_hash():
    hashed = auth.hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert auth.verify_password("correct horse battery staple", hashed)


def test_verify_password_rejects_wrong_password():
    hashed = auth.hash_password("correct horse battery staple")
    assert not auth.verify_password("wrong password", hashed)


def test_create_access_token_has_three_dot_separated_parts():
    token = auth.create_access_token(user_id=42)
    parts = token.split(".")
    assert len(parts) == 3


def test_decode_token_round_trips_user_id():
    token = auth.create_access_token(user_id=42)
    data = auth._decode_token(token)
    assert data["sub"] == "42"


def test_decode_token_rejects_malformed_token():
    with pytest.raises(HTTPException) as exc_info:
        auth._decode_token("not-a-jwt")
    assert exc_info.value.status_code == 401


def test_decode_token_rejects_tampered_signature():
    token = auth.create_access_token(user_id=1)
    header, payload, sig = token.split(".")
    tampered_sig = f"{sig[:-1]}{'a' if sig[-1] != 'a' else 'b'}"
    with pytest.raises(HTTPException) as exc_info:
        auth._decode_token(f"{header}.{payload}.{tampered_sig}")
    assert exc_info.value.status_code == 401


def test_decode_token_rejects_expired_token(monkeypatch):
    real_time = time.time
    monkeypatch.setattr(auth.time, "time", lambda: real_time() - auth.ACCESS_TOKEN_EXPIRE_SECONDS - 10)
    token = auth.create_access_token(user_id=1)
    monkeypatch.setattr(auth.time, "time", real_time)

    with pytest.raises(HTTPException) as exc_info:
        auth._decode_token(token)
    assert exc_info.value.status_code == 401
