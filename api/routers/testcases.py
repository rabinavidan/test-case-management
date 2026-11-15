"""Test cases: list, create, update, delete."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db

router = APIRouter()


# ─── Test Cases ───────────────────────────────────────────────────────────────

@router.get("/api/suites/{suite_id}/testcases", response_model=List[schemas.TestCaseResponse])
def list_testcases(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id
    ).order_by(models.TestCase.created_at.desc()).all()


@router.post("/api/suites/{suite_id}/testcases", response_model=schemas.TestCaseResponse, status_code=201)
def create_testcase(suite_id: int, payload: schemas.TestCaseCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    tc = models.TestCase(suite_id=suite_id, **payload.model_dump())
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@router.put("/api/testcases/{tc_id}", response_model=schemas.TestCaseResponse)
def update_testcase(tc_id: int, payload: schemas.TestCaseUpdate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    updates = payload.model_dump(exclude_unset=True)
    # title/status/priority are non-nullable in TestCaseResponse; an explicit
    # `null` for one of them (distinct from omitting the field) must not
    # overwrite it — caught by the contract test suite (tests/backend/contract/),
    # which fuzzes update payloads and crashed response serialization on this.
    for field in ("title", "status", "priority"):
        if updates.get(field) is None:
            updates.pop(field, None)
    for field, value in updates.items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@router.delete("/api/testcases/{tc_id}", status_code=204)
def delete_testcase(tc_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    db.delete(tc)
    db.commit()
