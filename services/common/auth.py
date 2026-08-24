"""Stateless JWT verifier shared by projects, runs, and ai — reads user id +
role straight from the token payload, no DB round-trip needed. Replaces the
identical code that used to be duplicated in services/_shared_auth.py and
each of projects/runs/ai's own auth.py.

The auth service itself is different (it's the one that mints tokens, and
its get_current_user/require_admin are DB-backed to support user
activation/deactivation) — see services/auth/auth.py, which uses
services.common.jwt directly rather than this module.
"""
import os
from typing import Optional

from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .jwt import decode_token

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "testflow-dev-secret-change-in-production").encode()
bearer = HTTPBearer(auto_error=False)


class UserClaims(BaseModel):
    id: int
    role: str


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> UserClaims:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    data = decode_token(creds.credentials, SECRET_KEY)
    return UserClaims(id=int(data["sub"]), role=data.get("role", "executor"))


def require_admin(user: UserClaims = Depends(get_current_user)) -> UserClaims:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
