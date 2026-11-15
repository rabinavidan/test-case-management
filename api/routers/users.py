"""User management (admin only): list, create executor, delete, enable/disable."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import hash_password, require_admin
from ..database import get_db

router = APIRouter()


# ─── User management (admin only) ────────────────────────────────────────────

@router.get("/api/users", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("/api/users", response_model=schemas.UserResponse, status_code=201)
def create_executor(body: schemas.UserRegister, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = models.User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="executor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current: models.User = Depends(require_admin)):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


@router.patch("/api/users/{user_id}/status", response_model=schemas.UserResponse)
def toggle_user_status(user_id: int, db: Session = Depends(get_db), current: models.User = Depends(require_admin)):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user
