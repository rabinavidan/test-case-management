"""Request/response logging into the Log Center table (GET /api/logs)."""
import logging
import time
import traceback

from fastapi import Request
from starlette.concurrency import run_in_threadpool

from . import models
from .database import get_db

logger = logging.getLogger("testflow")


# ─── Log Center — persists request/response and error activity so it's
# visible from the app itself (GET /api/logs), not just Vercel's function
# console. Uses its own short-lived session (middleware has no `Depends`),
# and never lets a logging failure break the actual request. ──────────────
LOG_RETENTION_MAX_ROWS = 5000

# The FastAPI app whose `dependency_overrides` decide which DB a log row goes
# to. api/main.py binds it once at startup; a module-level reference instead
# of an import keeps this module free of a main <-> request_log import cycle.
_app = None


def bind_app(app) -> None:
    global _app
    _app = app


def _record_log(**fields):
    try:
        # Respect a test's `get_db` dependency override (a separate throwaway
        # DB) instead of always hitting the real production engine — the
        # same session factory every other endpoint effectively uses.
        overrides = _app.dependency_overrides if _app is not None else {}
        db_gen = overrides.get(get_db, get_db)()
        db = next(db_gen)
        try:
            db.add(models.LogEntry(**fields))
            db.commit()
            total = db.query(models.LogEntry).count()
            if total > LOG_RETENTION_MAX_ROWS:
                stale_ids = [
                    row.id for row in db.query(models.LogEntry.id)
                    .order_by(models.LogEntry.created_at.asc())
                    .limit(total - LOG_RETENTION_MAX_ROWS)
                ]
                db.query(models.LogEntry).filter(models.LogEntry.id.in_(stale_ids)).delete(synchronize_session=False)
                db.commit()
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass
    except Exception:
        logger.exception("Failed to persist log entry")


# ─── Request/Response logging middleware ──────────────────────────────────────
# _record_log blocks on the DB, so it runs in the threadpool: on the event
# loop it waited for a pooled connection while the requests holding every
# connection needed that same loop to release them (a deadlock that only the
# 30s pool timeout broke).
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        logger.exception(f'{request.method} {request.url.path} 500 {duration_ms}ms')
        await run_in_threadpool(
            _record_log,
            level="error", source="server", message=f"{type(exc).__name__}: {exc}"[:500],
            method=request.method, path=request.url.path, status_code=500,
            duration_ms=int(duration_ms), extra=traceback.format_exc()[-2000:],
        )
        raise
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    if not request.url.path.startswith("/static"):
        logger.info(f'{request.method} {request.url.path} {response.status_code} {duration_ms}ms')
        level = "error" if response.status_code >= 500 else "warning" if response.status_code >= 400 else "info"
        await run_in_threadpool(
            _record_log,
            level=level, source="server", message=f"{request.method} {request.url.path}"[:500],
            method=request.method, path=request.url.path, status_code=response.status_code,
            duration_ms=int(duration_ms),
        )
    return response
