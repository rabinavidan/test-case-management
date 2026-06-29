import os, base64, hashlib, hmac, json, time
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .database import get_db
from . import models

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "testflow-dev-secret-change-in-production").encode()
TOKEN_TTL = 60 * 60 * 24 * 7

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (4 - len(s) % 4) % 4)


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, role: str) -> str:
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64e(json.dumps({"sub": str(user_id), "role": role, "exp": int(time.time()) + TOKEN_TTL}).encode())
    sig = _b64e(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def _decode_token(token: str) -> dict:
    try:
        header, payload, sig = token.split(".")
    except ValueError:
        raise HTTPException(401, "Invalid token")
    expected = _b64e(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Invalid token")
    data = json.loads(_b64d(payload))
    if data.get("exp", 0) < int(time.time()):
        raise HTTPException(401, "Token expired")
    return data


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    data = _decode_token(creds.credentials)
    user = db.query(models.User).filter(models.User.id == int(data["sub"])).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
