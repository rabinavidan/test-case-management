import os, base64, hashlib, hmac, json, time
from typing import Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "testflow-dev-secret-change-in-production").encode()
bearer = HTTPBearer(auto_error=False)


class UserClaims(BaseModel):
    id: int
    role: str


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (4 - len(s) % 4) % 4)


def _decode(token: str) -> dict:
    try:
        h, p, sig = token.split(".")
    except ValueError:
        raise HTTPException(401, "Invalid token")
    if not hmac.compare_digest(sig, _b64e(hmac.new(SECRET_KEY, f"{h}.{p}".encode(), hashlib.sha256).digest())):
        raise HTTPException(401, "Invalid token")
    data = json.loads(_b64d(p))
    if data.get("exp", 0) < int(time.time()):
        raise HTTPException(401, "Token expired")
    return data


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> UserClaims:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    data = _decode(creds.credentials)
    return UserClaims(id=int(data["sub"]), role=data.get("role", "executor"))


def require_admin(user: UserClaims = Depends(get_current_user)) -> UserClaims:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
