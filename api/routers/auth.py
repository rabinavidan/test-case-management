"""Authentication: first-run setup status, register, login (rate-limited), current user."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..rate_limit import limiter

router = APIRouter()


@router.get("/api/auth/setup")
def setup_status(db: Session = Depends(get_db)):
    """Returns whether the system needs initial admin setup."""
    return {"setup_needed": db.query(models.User).count() == 0}


@router.post("/api/auth/register", response_model=schemas.TokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: schemas.UserRegister, db: Session = Depends(get_db)):
    """Bootstrap endpoint — only works when no users exist (creates the admin account)."""
    if db.query(models.User).count() > 0:
        raise HTTPException(status_code=403, detail="Registration is closed. Contact your admin.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = models.User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.id), "user": user}


@router.post("/api/auth/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return {"access_token": create_access_token(user.id), "user": user}


@router.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
