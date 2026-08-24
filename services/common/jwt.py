"""Single implementation of the HMAC-SHA256 "JWT-like" token scheme used by
every service. Previously duplicated per-service (services/auth/auth.py,
services/_shared_auth.py, and each of projects/runs/ai's own auth.py) —
including an operator-precedence bug in the base64 padding math
(`"=" * (4 - len(s) % 4) % 4`, multiplying before the modulo instead of
after) that crashed every authenticated request across the whole
microservices deployment. Fixed individually in all five copies first;
this module is what stops that class of bug from recurring — there is now
exactly one place this logic lives.
"""
import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * ((4 - len(s) % 4) % 4))


def encode_token(payload: dict, secret: bytes) -> str:
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64e(json.dumps(payload).encode())
    sig = _b64e(hmac.new(secret, f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def decode_token(token: str, secret: bytes) -> dict:
    try:
        header, body, sig = token.split(".")
    except ValueError:
        raise HTTPException(401, "Invalid token")
    expected = _b64e(hmac.new(secret, f"{header}.{body}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Invalid token")
    data = json.loads(_b64d(body))
    if data.get("exp", 0) < int(time.time()):
        raise HTTPException(401, "Token expired")
    return data
