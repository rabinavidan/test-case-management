"""Log Center: server request/error log and client-side error reports."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db
from ..request_log import _record_log

router = APIRouter()


@router.get("/api/logs", response_model=schemas.PaginatedLogs)
def list_logs(
    level: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    q = db.query(models.LogEntry)
    if level:
        q = q.filter(models.LogEntry.level == level)
    if source:
        q = q.filter(models.LogEntry.source == source)
    if search:
        q = q.filter(models.LogEntry.message.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(models.LogEntry.created_at.desc()) \
             .offset((page - 1) * page_size).limit(page_size).all()
    return schemas.PaginatedLogs(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post("/api/logs/client", status_code=201)
def submit_client_log(body: schemas.ClientLogCreate, db: Session = Depends(get_db)):
    """Public — an error in a logged-out visitor's browser is still worth capturing."""
    _record_log(
        level="error", source="client", message=body.message,
        path=body.url, extra=body.stack,
    )
    return {"detail": "logged"}
