import os, json, asyncio, random, logging
from datetime import datetime, timedelta
from typing import List, Dict, Set
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import httpx

from .database import engine, get_db, Base
from . import models, schemas
from .auth import get_current_user, UserClaims
from .events import publish_run_completed

Base.metadata.create_all(bind=engine)

PROJECTS_SERVICE_URL = os.getenv("PROJECTS_SERVICE_URL", "http://projects:8002")
logger = logging.getLogger("runs")

app = FastAPI(title="Runs Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ─── WebSocket connection manager ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self._rooms: Dict[int, Set[WebSocket]] = {}

    async def connect(self, run_id: int, ws: WebSocket):
        await ws.accept()
        self._rooms.setdefault(run_id, set()).add(ws)

    def disconnect(self, run_id: int, ws: WebSocket):
        room = self._rooms.get(run_id, set())
        room.discard(ws)
        if not room:
            self._rooms.pop(run_id, None)

    async def broadcast(self, run_id: int, payload: dict):
        room = self._rooms.get(run_id, set())
        dead = set()
        for ws in room:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.add(ws)
        for ws in dead:
            room.discard(ws)


ws_manager = ConnectionManager()


@app.get("/health")
def health():
    return {"status": "ok", "service": "runs"}


# ─── Internal endpoints (called by other services) ────────────────────────────

@app.get("/internal/projects/last-run-stats")
def internal_last_run_stats(suite_ids: str, db: Session = Depends(get_db)):
    ids = [int(x) for x in suite_ids.split(",") if x.strip()]
    if not ids:
        return {"total_runs": 0, "last_run_pass": 0, "last_run_fail": 0,
                "last_run_skip": 0, "last_run_pending": 0, "last_run_name": None}
    total_runs = db.query(models.TestRun).filter(models.TestRun.suite_id.in_(ids)).count()
    last_run = db.query(models.TestRun).filter(models.TestRun.suite_id.in_(ids))\
                 .order_by(models.TestRun.created_at.desc()).first()
    if not last_run:
        return {"total_runs": 0, "last_run_pass": 0, "last_run_fail": 0,
                "last_run_skip": 0, "last_run_pending": 0, "last_run_name": None}
    counts = {"pass": 0, "fail": 0, "skip": 0, "pending": 0}
    for r in db.query(models.TestResult).filter(models.TestResult.run_id == last_run.id).all():
        counts[r.status if r.status in counts else "pending"] += 1
    return {"total_runs": total_runs, "last_run_name": last_run.name,
            "last_run_pass": counts["pass"], "last_run_fail": counts["fail"],
            "last_run_skip": counts["skip"], "last_run_pending": counts["pending"]}


@app.get("/internal/projects/run-history")
def internal_run_history(suite_ids: str, db: Session = Depends(get_db)):
    ids = [int(x) for x in suite_ids.split(",") if x.strip()]
    if not ids:
        return []
    runs = db.query(models.TestRun).filter(
        models.TestRun.suite_id.in_(ids),
        models.TestRun.completed_at.isnot(None),
    ).order_by(models.TestRun.created_at.desc()).limit(15).all()

    history = []
    for run in reversed(runs):
        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
        p = sum(1 for r in results if r.status == "pass")
        f = sum(1 for r in results if r.status == "fail")
        s = sum(1 for r in results if r.status == "skip")
        total = len(results)
        history.append({"run_name": run.name, "created_at": run.created_at.isoformat(),
                         "pass_count": p, "fail_count": f, "skip_count": s,
                         "total": total, "pass_rate": round(p / total * 100, 1) if total else 0})
    return history


@app.post("/internal/demo/seed-runs")
def internal_seed_runs(body: dict, db: Session = Depends(get_db)):
    """Seed demo runs for a list of suite_ids (called by projects service)."""
    suite_ids = body.get("suite_ids", [])
    for i, suite_id in enumerate(suite_ids, 1):
        # Get active testcase count from projects service
        tc_count = 3  # default fallback
        try:
            resp = httpx.get(f"{PROJECTS_SERVICE_URL}/internal/suites/{suite_id}/active-testcases", timeout=5)
            if resp.status_code == 200:
                tc_count = len(resp.json())
        except Exception:
            pass
        if tc_count == 0:
            continue
        run = models.TestRun(
            suite_id=suite_id,
            name=f"Demo Run #{i}",
            created_at=datetime.utcnow() - timedelta(hours=random.randint(1, 48)),
        )
        db.add(run)
        db.flush()
        for tc_id_offset in range(tc_count):
            status = random.choices(["pass", "fail", "skip"], weights=[70, 20, 10], k=1)[0]
            db.add(models.TestResult(run_id=run.id, testcase_id=tc_id_offset + 1,
                                     status=status, executed_at=datetime.utcnow()))
        run.completed_at = datetime.utcnow()
    db.commit()
    return {"seeded": len(suite_ids)}


# ─── Test Runs ────────────────────────────────────────────────────────────────

@app.post("/api/suites/{suite_id}/runs", response_model=schemas.TestRunResponse, status_code=201)
def create_run(suite_id: int, payload: schemas.TestRunCreate,
               db: Session = Depends(get_db), current: UserClaims = Depends(get_current_user)):
    # Fetch active test cases from projects service
    try:
        resp = httpx.get(f"{PROJECTS_SERVICE_URL}/internal/suites/{suite_id}/active-testcases", timeout=5)
        if resp.status_code == 404:
            raise HTTPException(404, "Suite not found")
        test_cases = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Projects service unavailable")

    run = models.TestRun(suite_id=suite_id, name=payload.name, created_by_id=current.id)
    db.add(run)
    db.flush()
    for tc in test_cases:
        db.add(models.TestResult(run_id=run.id, testcase_id=tc["id"], status="pending"))
    db.commit()
    db.refresh(run)
    return run


@app.get("/api/suites/{suite_id}/runs", response_model=List[schemas.TestRunResponse])
def list_runs(suite_id: int, db: Session = Depends(get_db)):
    return db.query(models.TestRun).filter(models.TestRun.suite_id == suite_id)\
             .order_by(models.TestRun.created_at.desc()).all()


@app.get("/api/runs/{run_id}", response_model=schemas.TestRunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@app.put("/api/runs/{run_id}/results/{tc_id}")
async def update_result(run_id: int, tc_id: int, payload: schemas.TestResultUpdate,
                        db: Session = Depends(get_db), current: UserClaims = Depends(get_current_user)):
    result = db.query(models.TestResult).filter(
        models.TestResult.run_id == run_id,
        models.TestResult.testcase_id == tc_id,
    ).first()
    if not result:
        raise HTTPException(404, "Result not found")

    result.status = payload.status
    result.notes = payload.notes
    result.executed_at = datetime.utcnow()

    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    all_results = db.query(models.TestResult).filter(models.TestResult.run_id == run_id).all()
    run_completed = all(r.status != "pending" for r in all_results)
    if run_completed and not run.completed_at:
        run.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)

    if run_completed:
        counts = {s: sum(1 for r in all_results if r.status == s) for s in ("pass", "fail", "skip")}
        publish_run_completed(run_id, run.suite_id, counts["pass"], counts["fail"], counts["skip"])

    await ws_manager.broadcast(run_id, {
        "type": "result_updated",
        "testcase_id": tc_id,
        "status": result.status,
        "notes": result.notes,
        "updated_by": str(current.id),
        "run_completed": run_completed,
    })

    return {"id": result.id, "status": result.status, "notes": result.notes}


# ─── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/runs/{run_id}")
async def run_websocket(run_id: int, ws: WebSocket):
    await ws_manager.connect(run_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, ws)
