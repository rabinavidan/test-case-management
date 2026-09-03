import os
import pathlib
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from typing import List

from .database import engine, get_db, Base
from . import models, schemas
from .auth import hash_password, create_access_token, get_current_user, require_admin
from services.common.health import health_response
from services.common.logging_config import configure_json_logging
from services.common.request_id import RequestIDMiddleware

logger = configure_json_logging("auth")

Base.metadata.create_all(bind=engine)

# Seed admin from env on startup
def _seed_admin():
    username = os.getenv("SEED_ADMIN_USERNAME")
    password = os.getenv("SEED_ADMIN_PASSWORD")
    email = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
    if not username or not password:
        return
    from .database import SessionLocal
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.username == username).first()
        if existing:
            existing.hashed_password = hash_password(password)
            existing.role = "admin"
        else:
            db.add(models.User(username=username, email=email,
                               hashed_password=hash_password(password), role="admin"))
        db.commit()
    finally:
        db.close()

_seed_admin()

app = FastAPI(title="Auth Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(RequestIDMiddleware, logger=logger)

# Rate limiting on auth endpoints — brute-force/credential-stuffing protection.
# Disabled under the test suite (tests/conftest.py sets this) — see api/main.py
# for why.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=os.getenv("TESTFLOW_DISABLE_RATE_LIMIT") != "1",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.get("/health")
def health():
    return health_response("auth")


@app.get("/api/version")
def version():
    v = pathlib.Path(__file__).parent.parent.parent.joinpath("VERSION")
    return {"version": v.read_text().strip() if v.exists() else "unknown"}


@app.get("/api/auth/setup")
def setup_status(db: Session = Depends(get_db)):
    return {"setup_needed": db.query(models.User).count() == 0}


@app.post("/api/auth/register", response_model=schemas.TokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: schemas.UserRegister, db: Session = Depends(get_db)):
    if db.query(models.User).count() > 0:
        raise HTTPException(403, "Registration is closed. Contact your admin.")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = models.User(username=body.username, email=body.email,
                       hashed_password=hash_password(body.password), role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.id, user.role), "user": user}


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: schemas.UserLogin, db: Session = Depends(get_db)):
    from .auth import verify_password
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid username or password")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated")
    return {"access_token": create_access_token(user.id, user.role), "user": user}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current: models.User = Depends(get_current_user)):
    return current


@app.get("/api/users", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at).all()


@app.post("/api/users", response_model=schemas.UserResponse, status_code=201)
def create_user(body: schemas.UserRegister, db: Session = Depends(get_db),
                _: models.User = Depends(require_admin)):
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(400, "Username already taken")
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = models.User(username=body.username, email=body.email,
                       hashed_password=hash_password(body.password), role="executor")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db),
                current: models.User = Depends(require_admin)):
    if current.id == user_id:
        raise HTTPException(400, "Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()


@app.patch("/api/users/{user_id}/status", response_model=schemas.UserResponse)
def toggle_status(user_id: int, db: Session = Depends(get_db),
                  current: models.User = Depends(require_admin)):
    if current.id == user_id:
        raise HTTPException(400, "Cannot change your own status")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user
