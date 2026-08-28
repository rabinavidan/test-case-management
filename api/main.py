from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Set
from datetime import datetime, timedelta
import os
import random
import hashlib
import pathlib
import json
import time
import logging
import asyncio

# ─── Structured logging setup ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
logger = logging.getLogger("testflow")

VERSION = pathlib.Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()

from sqlalchemy.exc import OperationalError

from .database import engine, get_db, Base
from . import models, schemas
from .auth import hash_password, verify_password, create_access_token, get_current_user, require_admin


def _with_db_retry(func, attempts=3, base_delay=0.5):
    """Retry a DB call on transient connection errors (e.g. Neon's pooler
    briefly rejecting a burst of simultaneous cold-start connections)."""
    for attempt in range(attempts):
        try:
            return func()
        except OperationalError:
            if attempt == attempts - 1:
                raise
            time.sleep(base_delay * (2 ** attempt))


# Create all tables
_with_db_retry(lambda: Base.metadata.create_all(bind=engine))

# Migrate: add columns that may be missing from older deployments
def _run_migrations():
    try:
        with _with_db_retry(lambda: engine.connect()) as conn:
            from sqlalchemy import text
            for stmt in [
                "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'executor'",
                "ALTER TABLE test_runs ADD COLUMN created_by_id INTEGER REFERENCES users(id)",
                "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
                "ALTER TABLE test_runs ADD COLUMN environment_id INTEGER REFERENCES environments(id)",
            ]:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    conn.rollback()
    except Exception:
        pass

_run_migrations()

# Seed/update admin user from env vars at module load time (runs on every cold start)
def _seed_admin():
    seed_user = os.getenv("SEED_ADMIN_USERNAME")
    seed_pass = os.getenv("SEED_ADMIN_PASSWORD")
    seed_email = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
    if not seed_user or not seed_pass:
        return
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            existing = _with_db_retry(
                lambda: db.query(models.User).filter(models.User.username == seed_user).first()
            )
            if existing:
                # Update password and ensure admin role
                existing.hashed_password = hash_password(seed_pass)
                existing.role = "admin"
            else:
                db.add(models.User(
                    username=seed_user,
                    email=seed_email,
                    hashed_password=hash_password(seed_pass),
                    role="admin",
                ))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass

_seed_admin()

# Seed the fixed 4-environment pipeline (staging -> regression -> preprod ->
# prod) at module load time, matching k8s/overlays/*. Idempotent: only
# inserts rows whose key is missing, never overwrites an existing row (an
# operator may have hand-edited node_name/namespace to match a real cluster).
_ENVIRONMENT_SEED = [
    {"key": "staging",    "name": "Staging",    "tier": 1, "namespace": "testflow-staging",    "node_name": "node-staging-1",    "region": "us-east-1"},
    {"key": "regression", "name": "Regression", "tier": 2, "namespace": "testflow-regression", "node_name": "node-regression-1", "region": "us-east-1"},
    {"key": "preprod",    "name": "Preprod",    "tier": 3, "namespace": "testflow-preprod",    "node_name": "node-preprod-1",    "region": "us-west-2"},
    {"key": "prod",       "name": "Prod",       "tier": 4, "namespace": "testflow-prod",       "node_name": "node-prod-1",       "region": "us-west-2"},
]


def _seed_environments():
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            existing_keys = {e.key for e in _with_db_retry(lambda: db.query(models.Environment).all())}
            for env in _ENVIRONMENT_SEED:
                if env["key"] not in existing_keys:
                    db.add(models.Environment(**env))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass

_seed_environments()

app = FastAPI(
    title="TestFlow API",
    version=VERSION,
    description="AI-powered test case management with real-time collaboration",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(OverflowError)
async def overflow_error_handler(request: Request, exc: OverflowError):
    """`int` path params (project_id, suite_id, ...) have no upper bound at
    the FastAPI/Pydantic layer, so an out-of-SQLite-INTEGER-range value
    (e.g. > 2**63-1) reaches the DB layer and raises here instead of a clean
    404/422 — surfaced by the contract test suite (tests/contract/), which
    fuzzes path params with extreme integers.
    """
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"loc": ["path"], "msg": "Invalid ID: out of range", "type": "value_error"}
            ]
        },
    )


# ─── Request/Response logging middleware ──────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    if not request.url.path.startswith("/static"):
        logger.info(f'{request.method} {request.url.path} {response.status_code} {duration_ms}ms')
    return response


# ─── WebSocket connection manager ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # run_id -> set of connected WebSockets
        self._rooms: Dict[int, Set[WebSocket]] = {}

    async def connect(self, run_id: int, ws: WebSocket):
        await ws.accept()
        self._rooms.setdefault(run_id, set()).add(ws)
        logger.info(f"WS connected run={run_id} total={len(self._rooms[run_id])}")

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

# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.get("/api/version")
def get_version():
    return {"version": VERSION}

@app.get("/api/auth/setup")
def setup_status(db: Session = Depends(get_db)):
    """Returns whether the system needs initial admin setup."""
    return {"setup_needed": db.query(models.User).count() == 0}


# ─── Environments ─────────────────────────────────────────────────────────────
# This demo has no live cluster behind it (it runs on Vercel), so pod/node
# health below is synthetic telemetry standing in for a kubectl/metrics-server
# poll — deterministic within a 5-minute window so numbers don't jitter on
# every refresh, and closer to "healthy" for prod/preprod than for
# staging/regression, mirroring the stability gradient a real pipeline has.
# Swap `_simulate_environment_health` for a real Kubernetes client call
# (`kubernetes.client.CoreV1Api`) to point this at an actual cluster; the
# node/namespace layout it reports already matches k8s/overlays/<key>/.
_ENVIRONMENT_DESIRED_PODS = {"staging": 2, "regression": 2, "preprod": 3, "prod": 4}


def _simulate_environment_health(key: str) -> dict:
    bucket = int(time.time() // 300)
    seed = int(hashlib.sha256(f"{key}:{bucket}".encode()).hexdigest(), 16)
    rnd = random.Random(seed)
    desired = _ENVIRONMENT_DESIRED_PODS.get(key, 2)
    healthy_bias = 0.97 if key in ("prod", "preprod") else 0.9
    ready = desired if rnd.random() < healthy_bias else max(0, desired - rnd.randint(1, 2))
    status = "healthy" if ready == desired else ("degraded" if ready > 0 else "down")
    load_bias = 15 if key == "prod" else 0
    return {
        "status": status,
        "pods_ready": ready,
        "pods_desired": desired,
        "cpu_pct": round(rnd.uniform(15, 45) + load_bias, 1),
        "mem_pct": round(rnd.uniform(20, 55) + load_bias, 1),
        "uptime_seconds": rnd.randint(3600, 30 * 24 * 3600),
    }


@app.get("/api/environments", response_model=List[schemas.EnvironmentResponse])
def list_environments(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    envs = db.query(models.Environment).order_by(models.Environment.tier).all()
    return [
        schemas.EnvironmentResponse(
            id=e.id, key=e.key, name=e.name, tier=e.tier,
            namespace=e.namespace, node_name=e.node_name, region=e.region,
            **_simulate_environment_health(e.key),
        )
        for e in envs
    ]


# ─── Contact Us ────────────────────────────────────────────────────────────
# Public, unauthenticated — anyone browsing the landing page can reach out.
# Every submission is saved first (source of truth), then a best-effort
# notification email is attempted. Two backends are supported:
#   - RESEND_API_KEY: an HTTP API call (works from serverless platforms like
#     Vercel, which commonly block outbound SMTP ports).
#   - SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD: plain SMTP, for self-hosted
#     deployments (Docker Compose) where outbound SMTP isn't blocked.
# Neither configured -> the message is still saved; only the email is skipped.
CONTACT_EMAIL_TO = os.getenv("CONTACT_EMAIL_TO", "rabin.avidan.dev@gmail.com")


def _send_contact_email(msg: models.ContactMessage) -> bool:
    subject = f"[TestFlow Contact] {msg.topic}"
    body = f"Topic: {msg.topic}\nFrom: {msg.email}\nPhone: {msg.phone}\n\n{msg.description}\n"

    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        try:
            import httpx
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}"},
                json={
                    "from": os.getenv("CONTACT_EMAIL_FROM", "TestFlow Contact <onboarding@resend.dev>"),
                    "to": [CONTACT_EMAIL_TO],
                    "reply_to": msg.email,
                    "subject": subject,
                    "text": body,
                },
                timeout=10,
            )
            if r.status_code >= 300:
                logger.warning(f"Resend contact email failed: {r.status_code} {r.text}")
            return r.status_code < 300
        except Exception:
            logger.exception("Failed to send contact email via Resend")
            return False

    smtp_host = os.getenv("SMTP_HOST")
    if smtp_host:
        try:
            import smtplib
            from email.message import EmailMessage
            email_msg = EmailMessage()
            email_msg["Subject"] = subject
            email_msg["From"] = os.getenv("SMTP_USERNAME", CONTACT_EMAIL_TO)
            email_msg["To"] = CONTACT_EMAIL_TO
            email_msg["Reply-To"] = msg.email
            email_msg.set_content(body)
            with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as server:
                if os.getenv("SMTP_USE_TLS", "true").lower() != "false":
                    server.starttls()
                smtp_user = os.getenv("SMTP_USERNAME")
                if smtp_user:
                    server.login(smtp_user, os.getenv("SMTP_PASSWORD", ""))
                server.send_message(email_msg)
            return True
        except Exception:
            logger.exception("Failed to send contact email via SMTP")
            return False

    logger.warning("Contact message saved but no email backend configured (RESEND_API_KEY or SMTP_HOST)")
    return False


@app.post("/api/contact", status_code=201)
def submit_contact(body: schemas.ContactCreate, db: Session = Depends(get_db)):
    if "@" not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    msg = models.ContactMessage(
        topic=body.topic.strip(),
        email=body.email.strip(),
        phone=body.phone.strip(),
        description=body.description.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    _send_contact_email(msg)
    return {"detail": "Message sent"}


@app.post("/api/auth/register", response_model=schemas.TokenResponse, status_code=201)
def register(body: schemas.UserRegister, db: Session = Depends(get_db)):
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


# ─── User management (admin only) ────────────────────────────────────────────

@app.get("/api/users", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at).all()


@app.post("/api/users", response_model=schemas.UserResponse, status_code=201)
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


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current: models.User = Depends(require_admin)):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


@app.patch("/api/users/{user_id}/status", response_model=schemas.UserResponse)
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


@app.get("/api/debug/seed")
def debug_seed(db: Session = Depends(get_db)):
    import traceback
    seed_user = os.getenv("SEED_ADMIN_USERNAME")
    seed_pass = os.getenv("SEED_ADMIN_PASSWORD")
    result = {
        "env_username_set": bool(seed_user),
        "env_password_set": bool(seed_pass),
        "user_count": 0,
        "admin_exists": False,
        "seed_error": None,
    }
    try:
        result["user_count"] = db.query(models.User).count()
        if seed_user:
            result["admin_exists"] = db.query(models.User).filter(models.User.username == seed_user).count() > 0
        # Try running seed inline
        if seed_user and seed_pass:
            existing = db.query(models.User).filter(models.User.username == seed_user).first()
            if existing:
                existing.hashed_password = hash_password(seed_pass)
                existing.role = "admin"
            else:
                db.add(models.User(
                    username=seed_user,
                    email=os.getenv("SEED_ADMIN_EMAIL", "admin@example.com"),
                    hashed_password=hash_password(seed_pass),
                    role="admin",
                ))
            db.commit()
            result["seeded"] = True
    except Exception:
        result["seed_error"] = traceback.format_exc()
    return result


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(body: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return {"access_token": create_access_token(user.id), "user": user}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ─── Projects ────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=schemas.PaginatedProjects)
def list_projects(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
):
    q = db.query(models.Project)
    if search:
        q = q.filter(models.Project.name.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(models.Project.created_at.desc()) \
             .offset((page - 1) * page_size).limit(page_size).all()
    return schemas.PaginatedProjects(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@app.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()


# ─── Test Suites ─────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/suites", response_model=List[schemas.TestSuiteResponse])
def list_suites(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return db.query(models.TestSuite).filter(
        models.TestSuite.project_id == project_id
    ).order_by(models.TestSuite.created_at.desc()).all()


@app.post("/api/projects/{project_id}/suites", response_model=schemas.TestSuiteResponse, status_code=201)
def create_suite(project_id: int, payload: schemas.TestSuiteCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    suite = models.TestSuite(project_id=project_id, **payload.model_dump())
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@app.delete("/api/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    db.delete(suite)
    db.commit()


# ─── Test Cases ───────────────────────────────────────────────────────────────

@app.get("/api/suites/{suite_id}/testcases", response_model=List[schemas.TestCaseResponse])
def list_testcases(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id
    ).order_by(models.TestCase.created_at.desc()).all()


@app.post("/api/suites/{suite_id}/testcases", response_model=schemas.TestCaseResponse, status_code=201)
def create_testcase(suite_id: int, payload: schemas.TestCaseCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    tc = models.TestCase(suite_id=suite_id, **payload.model_dump())
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@app.put("/api/testcases/{tc_id}", response_model=schemas.TestCaseResponse)
def update_testcase(tc_id: int, payload: schemas.TestCaseUpdate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    updates = payload.model_dump(exclude_unset=True)
    # title/status/priority are non-nullable in TestCaseResponse; an explicit
    # `null` for one of them (distinct from omitting the field) must not
    # overwrite it — caught by the contract test suite (tests/contract/),
    # which fuzzes update payloads and crashed response serialization on this.
    for field in ("title", "status", "priority"):
        if updates.get(field) is None:
            updates.pop(field, None)
    for field, value in updates.items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@app.delete("/api/testcases/{tc_id}", status_code=204)
def delete_testcase(tc_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    db.delete(tc)
    db.commit()


# ─── Test Runs ────────────────────────────────────────────────────────────────

@app.post("/api/suites/{suite_id}/runs", response_model=schemas.TestRunResponse, status_code=201)
def create_run(suite_id: int, payload: schemas.TestRunCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    environment_id = None
    if payload.environment_key:
        environment = db.query(models.Environment).filter(
            models.Environment.key == payload.environment_key
        ).first()
        if not environment:
            raise HTTPException(status_code=400, detail="Unknown environment")
        environment_id = environment.id

    run = models.TestRun(
        suite_id=suite_id, name=payload.name, created_by_id=current_user.id,
        environment_id=environment_id,
    )
    db.add(run)
    db.flush()

    # Create pending results for all active test cases
    test_cases = db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id,
        models.TestCase.status == "active"
    ).all()

    for tc in test_cases:
        result = models.TestResult(run_id=run.id, testcase_id=tc.id, status="pending")
        db.add(result)

    db.commit()
    db.refresh(run)
    return run


@app.get("/api/suites/{suite_id}/runs", response_model=List[schemas.TestRunResponse])
def list_runs(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return db.query(models.TestRun).filter(
        models.TestRun.suite_id == suite_id
    ).order_by(models.TestRun.created_at.desc()).all()


@app.get("/api/runs/{run_id}", response_model=schemas.TestRunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@app.put("/api/runs/{run_id}/results/{tc_id}")
async def update_result(run_id: int, tc_id: int, payload: schemas.TestResultUpdate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    result = db.query(models.TestResult).filter(
        models.TestResult.run_id == run_id,
        models.TestResult.testcase_id == tc_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result.status = payload.status
    result.notes = payload.notes
    result.executed_at = datetime.utcnow()

    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    all_results = db.query(models.TestResult).filter(models.TestResult.run_id == run_id).all()
    run_completed = all(r.status != "pending" for r in all_results)
    if run_completed:
        run.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)

    # Broadcast live update to all WebSocket subscribers on this run
    await ws_manager.broadcast(run_id, {
        "type": "result_updated",
        "testcase_id": tc_id,
        "status": result.status,
        "notes": result.notes,
        "updated_by": current.username,
        "run_completed": run_completed,
    })

    return {"id": result.id, "status": result.status, "notes": result.notes}


@app.post("/api/runs/{run_id}/triage", response_model=schemas.TriageResponse)
async def triage_run(run_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    """AI-powered failure triage: summarizes a run's failed/skipped results into a
    plain-English root-cause guess, using the same Claude Haiku client as AI test
    generation."""
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    problem_results = db.query(models.TestResult).filter(
        models.TestResult.run_id == run_id,
        models.TestResult.status.in_(["fail", "skip"]),
    ).all()

    if not problem_results:
        return schemas.TriageResponse(
            summary="No failed or skipped results in this run — nothing to triage.",
        )

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI triage unavailable: ANTHROPIC_API_KEY not configured",
        )

    problem_items = []
    lines = []
    for result in problem_results:
        tc = db.query(models.TestCase).filter(models.TestCase.id == result.testcase_id).first()
        title = tc.title if tc else f"Test case #{result.testcase_id}"
        problem_items.append(schemas.TriageResultItem(
            testcase_id=result.testcase_id,
            title=title,
            status=result.status,
            notes=result.notes,
        ))
        lines.append(
            f"- [{result.status.upper()}] {title}\n"
            f"  Steps: {tc.steps if tc and tc.steps else 'not recorded'}\n"
            f"  Expected result: {tc.expected_result if tc and tc.expected_result else 'not recorded'}\n"
            f"  Executor notes: {result.notes or 'none'}"
        )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = (
            "You are a senior QA engineer triaging a failed test run. Given the failed/skipped "
            "test cases below — each with its steps, expected result, and any notes the executor "
            "left — write a concise plain-English summary (3-5 sentences) of the likely root "
            "cause(s) tying these failures together, and suggest what to check first. Synthesize "
            "a diagnosis; do not just repeat the list back."
        )
        user_prompt = f"Run: {run.name}\n\nFailed/skipped results:\n" + "\n".join(lines)

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        summary = message.content[0].text.strip()
        logger.info(f"AI triage generated for run={run_id} ({len(problem_results)} problem results)")
        return schemas.TriageResponse(summary=summary, problem_results=problem_items, model=message.model)
    except Exception as e:
        logger.error(f"AI triage error: {e}")
        raise HTTPException(status_code=502, detail=f"AI triage failed: {str(e)}")


@app.get("/api/suites/{suite_id}/flaky-tests", response_model=schemas.FlakyTestsResponse)
def flaky_tests(suite_id: int, db: Session = Depends(get_db)):
    """Flags test cases whose pass/fail results have flip-flopped across runs — a
    repeated pass->fail or fail->pass transition (skips are excluded from the
    comparison, since they're inconclusive rather than a flip)."""
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    test_cases = db.query(models.TestCase).filter(models.TestCase.suite_id == suite_id).all()

    flaky_cases = []
    for tc in test_cases:
        history = [
            r.status for r in
            db.query(models.TestResult)
              .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
              .filter(
                  models.TestResult.testcase_id == tc.id,
                  models.TestResult.status.in_(["pass", "fail"]),
              )
              .order_by(models.TestRun.created_at.asc())
              .all()
        ]
        flips = sum(1 for i in range(1, len(history)) if history[i] != history[i - 1])
        if flips >= 2:
            flaky_cases.append(schemas.FlakyTestCase(
                testcase_id=tc.id,
                title=tc.title,
                executions=len(history),
                flip_count=flips,
                flakiness_score=round(flips / len(history), 2),
                history=history,
            ))

    flaky_cases.sort(key=lambda f: f.flakiness_score, reverse=True)
    return schemas.FlakyTestsResponse(suite_id=suite_id, flaky_cases=flaky_cases)


# ─── WebSocket: live run collaboration ────────────────────────────────────────

@app.websocket("/ws/runs/{run_id}")
async def run_websocket(run_id: int, ws: WebSocket):
    await ws_manager.connect(run_id, ws)
    try:
        while True:
            # Keep connection alive; client sends ping, we echo pong
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, ws)
        logger.info(f"WS disconnected run={run_id}")


# ─── AI Test Case Generation ──────────────────────────────────────────────────

@app.post("/api/suites/{suite_id}/testcases/generate", response_model=schemas.AIGenerateResponse)
async def generate_testcases(
    suite_id: int,
    payload: schemas.AIGenerateRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI generation unavailable: ANTHROPIC_API_KEY not configured",
        )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = (
            "You are a senior QA engineer. Generate detailed, actionable test cases for the given feature. "
            "Each test case must be concise, unambiguous, and cover a distinct scenario. "
            "Respond with a JSON object matching exactly this schema:\n"
            '{"test_cases": [{"title": str, "description": str, "steps": str, '
            '"expected_result": str, "priority": "low"|"medium"|"high"|"critical"}]}'
        )

        user_prompt = (
            f"Suite: {suite.name}\n"
            f"Feature description: {payload.feature_description}\n"
            f"Generate exactly {payload.count} test cases."
        )

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = message.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        test_cases = parsed.get("test_cases", [])

        logger.info(f"AI generated {len(test_cases)} test cases for suite={suite_id}")
        return schemas.AIGenerateResponse(
            test_cases=[schemas.AIGeneratedTestCase(**tc) for tc in test_cases],
            model=message.model,
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON; try again")
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(e)}")


@app.post("/api/suites/{suite_id}/testcases/generate/save")
async def save_generated_testcases(
    suite_id: int,
    payload: List[schemas.AIGeneratedTestCase],
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Bulk-save AI-generated test cases to a suite."""
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    created = []
    for tc in payload:
        obj = models.TestCase(suite_id=suite_id, status="draft", **tc.model_dump())
        db.add(obj)
        created.append(obj)
    db.commit()
    for obj in created:
        db.refresh(obj)
    logger.info(f"Saved {len(created)} AI-generated test cases to suite={suite_id}")
    return {"saved": len(created)}


# ─── Analytics ────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/analytics", response_model=schemas.ProjectAnalytics)
def project_analytics(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    suite_ids = [s.id for s in suites]

    # Last 15 runs across all suites, newest first
    runs = []
    if suite_ids:
        runs = db.query(models.TestRun).filter(
            models.TestRun.suite_id.in_(suite_ids),
            models.TestRun.completed_at.isnot(None),
        ).order_by(models.TestRun.created_at.desc()).limit(15).all()

    run_history = []
    for run in reversed(runs):
        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
        p = sum(1 for r in results if r.status == "pass")
        f = sum(1 for r in results if r.status == "fail")
        s = sum(1 for r in results if r.status == "skip")
        total = len(results)
        run_history.append(schemas.RunDataPoint(
            run_name=run.name,
            created_at=run.created_at,
            pass_count=p,
            fail_count=f,
            skip_count=s,
            total=total,
            pass_rate=round(p / total * 100, 1) if total else 0,
        ))

    # Suite coverage: active cases vs total per suite
    suite_coverage = []
    for suite in suites:
        total_cases = db.query(models.TestCase).filter(models.TestCase.suite_id == suite.id).count()
        active_cases = db.query(models.TestCase).filter(
            models.TestCase.suite_id == suite.id,
            models.TestCase.status == "active",
        ).count()
        suite_coverage.append({
            "suite_name": suite.name,
            "total": total_cases,
            "active": active_cases,
        })

    return schemas.ProjectAnalytics(
        project_id=project_id,
        project_name=project.name,
        run_history=run_history,
        suite_coverage=suite_coverage,
    )


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/stats", response_model=schemas.ProjectStats)
def project_stats(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    suite_ids = [s.id for s in suites]

    total_cases = db.query(models.TestCase).filter(
        models.TestCase.suite_id.in_(suite_ids)
    ).count() if suite_ids else 0

    total_runs = db.query(models.TestRun).filter(
        models.TestRun.suite_id.in_(suite_ids)
    ).count() if suite_ids else 0

    # Get last run across all suites
    last_run = None
    if suite_ids:
        last_run = db.query(models.TestRun).filter(
            models.TestRun.suite_id.in_(suite_ids)
        ).order_by(models.TestRun.created_at.desc()).first()

    pass_count = fail_count = skip_count = pending_count = 0
    last_run_name = None

    if last_run:
        last_run_name = last_run.name
        results = db.query(models.TestResult).filter(models.TestResult.run_id == last_run.id).all()
        for r in results:
            if r.status == "pass":
                pass_count += 1
            elif r.status == "fail":
                fail_count += 1
            elif r.status == "skip":
                skip_count += 1
            else:
                pending_count += 1

    return schemas.ProjectStats(
        total_suites=len(suites),
        total_cases=total_cases,
        total_runs=total_runs,
        last_run_pass=pass_count,
        last_run_fail=fail_count,
        last_run_skip=skip_count,
        last_run_pending=pending_count,
        last_run_name=last_run_name,
    )


# ─── Demo seed ───────────────────────────────────────────────────────────────

_DEMO_SUITES = [
    ("Data Ingestion", "Kafka and GCP Pub/Sub message ingestion", [
        ("Kafka topic receives alert event", "active", "high"),
        ("GCP Pub/Sub message published successfully", "active", "high"),
        ("Malformed message is rejected with error", "active", "medium"),
        ("Message retry on transient failure", "active", "medium"),
        ("Dead-letter queue captures failed messages", "active", "low"),
    ]),
    ("Alerts Logic Engine", "Core alert evaluation and rule matching", [
        ("Alert triggers when threshold exceeded", "active", "high"),
        ("No alert when value is within threshold", "active", "high"),
        ("Multi-condition rule evaluates correctly", "active", "high"),
        ("Alert deduplication prevents duplicate notifications", "active", "medium"),
        ("Alert severity mapped correctly (low/med/high)", "active", "medium"),
        ("Stale alert expires after TTL", "active", "low"),
    ]),
    ("Rule Validator", "Alert rule syntax and validation", [
        ("Valid rule passes validation", "active", "high"),
        ("Missing required field returns 400", "active", "high"),
        ("Invalid operator type rejected", "active", "medium"),
        ("Threshold out of range rejected", "active", "medium"),
        ("Rule with valid schedule accepted", "active", "low"),
    ]),
    ("Scheduler Service", "Scheduled alert job execution", [
        ("Scheduled job fires at correct interval", "active", "high"),
        ("Job does not fire when disabled", "active", "high"),
        ("Missed job recovers on restart", "active", "medium"),
        ("Concurrent jobs do not duplicate alerts", "active", "medium"),
        ("Job logs execution timestamp", "active", "low"),
    ]),
    ("Notification Engine", "Notification dispatch orchestration", [
        ("Notification routed to correct channel", "active", "high"),
        ("UI-only alert does not trigger email", "active", "high"),
        ("Daily digest batches alerts correctly", "active", "medium"),
        ("Weekly digest contains correct date range", "active", "medium"),
        ("Failed notification retried up to 3 times", "active", "medium"),
    ]),
    ("Email Engine", "Email delivery via SMTP/SendGrid", [
        ("Alert email sent with correct subject", "active", "high"),
        ("Email contains alert details and timestamp", "active", "high"),
        ("Unsubscribed user does not receive email", "active", "high"),
        ("Bounce handling marks address as invalid", "active", "medium"),
        ("SendGrid API failure falls back to SMTP", "active", "low"),
    ]),
    ("Data Persistence", "MongoDB, Elasticsearch, Solr, Redis, BigQuery storage", [
        ("User preferences saved to MongoDB", "active", "high"),
        ("Alert indexed in Elasticsearch", "active", "high"),
        ("Funding data queryable via Solr", "active", "medium"),
        ("Historical data retrievable from BigQuery", "active", "medium"),
        ("Cache hit served from Redis", "active", "high"),
        ("Redis cache invalidated on data update", "active", "medium"),
        ("Elasticsearch query returns ranked results", "active", "low"),
    ]),
    ("Notification Center UI", "Client-side notification center", [
        ("Notification center shows unread count", "active", "high"),
        ("Clicking notification marks it as read", "active", "high"),
        ("Real-time update appears without page reload", "active", "medium"),
        ("Empty state shown when no notifications", "active", "low"),
        ("Notification links to correct resource", "active", "medium"),
    ]),
]


def _seed_demo_runs(db, project_id):
    """Create one completed test run per suite with randomly distributed pass/fail/skip."""
    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    run_number = 1
    for suite in suites:
        cases = db.query(models.TestCase).filter(
            models.TestCase.suite_id == suite.id,
            models.TestCase.status == "active",
        ).all()
        if not cases:
            continue
        run = models.TestRun(
            suite_id=suite.id,
            name=f"Demo Run #{run_number}",
            created_at=datetime.utcnow() - timedelta(hours=random.randint(1, 48)),
        )
        db.add(run)
        db.flush()
        executed = datetime.utcnow() - timedelta(minutes=random.randint(5, 60))
        for tc in cases:
            status = random.choices(
                ["pass", "pass", "pass", "fail", "skip"],
                weights=[60, 10, 10, 15, 5],
                k=1,
            )[0]
            result = models.TestResult(
                run_id=run.id,
                testcase_id=tc.id,
                status=status,
                executed_at=executed,
            )
            db.add(result)
        run.completed_at = datetime.utcnow() - timedelta(minutes=random.randint(1, 5))
        run_number += 1


@app.post("/api/demo/alerts-microservice", response_model=schemas.ProjectResponse)
def seed_demo_alerts_microservice(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    project = models.Project(
        name=f"Alerts Microservice {ts}",
        description="Alerts Microservice with Kafka, MongoDB, Elasticsearch, etc.",
    )
    db.add(project)
    db.flush()

    for suite_name, suite_desc, cases in _DEMO_SUITES:
        suite = models.TestSuite(
            project_id=project.id,
            name=suite_name,
            description=suite_desc,
        )
        db.add(suite)
        db.flush()
        for title, status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project


_TESTFLOW_SUITES = [
    ("Project Management", "Create, edit, and delete projects", [
        ("Create project with name and description", "active", "high"),
        ("Project name is required on creation", "active", "high"),
        ("Delete project removes all suites and cases", "active", "high"),
        ("Project list shows newest first", "active", "medium"),
        ("Project count updates after creation", "active", "medium"),
        ("Filter projects by name", "active", "medium"),
        ("Sort projects by oldest first", "active", "low"),
    ]),
    ("Test Suite Management", "Create, list, and delete test suites", [
        ("Create suite within a project", "active", "high"),
        ("Suite name is required", "active", "high"),
        ("Delete suite removes all test cases", "active", "high"),
        ("Suites listed newest first", "active", "medium"),
        ("Suite count shown on project stats card", "active", "medium"),
    ]),
    ("Test Case Management", "Add, update, and remove test cases", [
        ("Create test case with title and priority", "active", "high"),
        ("Test case title is required", "active", "high"),
        ("Update test case status to deprecated", "active", "medium"),
        ("Delete test case removes from suite", "active", "medium"),
        ("Priority badge renders for high/medium/low", "active", "low"),
        ("Active cases appear in new test run", "active", "high"),
        ("Deprecated cases excluded from new run", "active", "medium"),
    ]),
    ("Test Run Execution", "Start runs and record results", [
        ("Create run generates pending results for active cases", "active", "high"),
        ("Mark result as pass updates run status", "active", "high"),
        ("Mark result as fail updates run status", "active", "high"),
        ("Mark result as skip updates run status", "active", "medium"),
        ("Run marked complete when all results non-pending", "active", "high"),
        ("Notes saved on result update", "active", "medium"),
        ("Pass rate calculated correctly on stats", "active", "high"),
    ]),
    ("REST API Endpoints", "FastAPI backend contract tests", [
        ("GET /api/projects returns list", "active", "high"),
        ("POST /api/projects creates project", "active", "high"),
        ("DELETE /api/projects/{id} returns 204", "active", "high"),
        ("GET /api/projects/{id}/suites returns list", "active", "high"),
        ("POST /api/suites/{id}/testcases creates case", "active", "high"),
        ("PUT /api/testcases/{id} updates fields", "active", "medium"),
        ("GET /api/projects/{id}/stats returns correct counts", "active", "high"),
        ("POST /api/suites/{id}/runs creates results", "active", "high"),
        ("PUT /api/runs/{id}/results/{tc} updates result", "active", "high"),
        ("404 returned for missing resources", "active", "medium"),
    ]),
    ("UI / SPA Behaviour", "Vanilla JS single-page app tests", [
        ("Hash routing navigates to correct view", "active", "high"),
        ("Breadcrumb updates on navigation", "active", "medium"),
        ("Sidebar project list updates after create", "active", "high"),
        ("Toast appears on successful create", "active", "medium"),
        ("Toast appears on delete", "active", "medium"),
        ("Modal closes on Cancel click", "active", "medium"),
        ("Modal closes on backdrop click", "active", "low"),
        ("New Project button hidden on project view", "active", "low"),
    ]),
    ("Playwright E2E Tests", "Browser automation with page object model", [
        ("Navigate to projects page on load", "active", "high"),
        ("Create project via New Project modal", "active", "high"),
        ("New project appears in sidebar and grid", "active", "high"),
        ("Open project and view stats", "active", "high"),
        ("Create suite from project page", "active", "high"),
        ("Create test case from suite page", "active", "high"),
        ("Start test run and mark all results", "active", "high"),
        ("Pass rate updates after completing run", "active", "medium"),
        ("Delete project via trash icon", "active", "medium"),
    ]),
    ("CI / CD Pipeline", "GitHub Actions and Vercel deployment checks", [
        ("API tests pass on pull request", "active", "high"),
        ("E2E tests run on push to main", "active", "high"),
        ("Job summary renders test report table", "active", "medium"),
        ("Vercel preview URL deployed per PR", "active", "high"),
        ("Production URL updated on merge to main", "active", "high"),
        ("Database migrations run on cold start", "active", "medium"),
        ("Static files served with correct cache headers", "active", "low"),
    ]),
]


@app.post("/api/demo/testflow", response_model=schemas.ProjectResponse)
def seed_demo_testflow(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    project = models.Project(
        name=f"TestFlow {ts}",
        description="TestFlow — test case management app (FastAPI + Vanilla JS + Neon PostgreSQL)",
    )
    db.add(project)
    db.flush()

    for suite_name, suite_desc, cases in _TESTFLOW_SUITES:
        suite = models.TestSuite(
            project_id=project.id,
            name=suite_name,
            description=suite_desc,
        )
        db.add(suite)
        db.flush()
        for title, status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project


_PLAYWRIGHT_SUITES = [
    ("Projects API — test_projects.py", "pytest · FastAPI TestClient · CRUD coverage", [
        ("test_list_projects_empty — GET /api/projects returns 200 with empty list", "active", "high"),
        ("test_create_project — POST /api/projects creates project and returns 201", "active", "high"),
        ("test_list_projects_after_create — list reflects newly created projects", "active", "medium"),
        ("test_delete_project — DELETE /api/projects/{id} removes project and returns 200", "active", "high"),
        ("test_delete_project_not_found — DELETE non-existent project returns 404", "active", "medium"),
    ]),
    ("Suites API — test_suites.py", "pytest · suite CRUD and project stats endpoint", [
        ("test_list_suites_empty — GET /api/projects/{id}/suites returns empty list", "active", "high"),
        ("test_create_suite — POST creates suite and returns correct suite_id and project_id", "active", "high"),
        ("test_create_suite_project_not_found — POST to missing project returns 404", "active", "medium"),
        ("test_delete_suite — DELETE suite removes it from the project", "active", "high"),
        ("test_project_stats — GET /api/projects/{id}/stats returns correct counts", "active", "medium"),
    ]),
    ("Test Cases API — test_testcases.py", "pytest · test case CRUD including update", [
        ("test_create_testcase — POST creates test case with title, status, priority", "active", "high"),
        ("test_list_testcases — GET /api/suites/{id}/testcases lists all cases", "active", "high"),
        ("test_update_testcase — PATCH updates title and status correctly", "active", "high"),
        ("test_delete_testcase — DELETE removes test case from suite", "active", "high"),
        ("test_testcase_suite_not_found — POST to missing suite returns 404", "active", "medium"),
    ]),
    ("Test Runs API — test_runs.py", "pytest · run creation, result recording, auto-complete", [
        ("test_create_run — POST /api/suites/{id}/runs creates run with active cases only", "active", "high"),
        ("test_list_runs — GET /api/suites/{id}/runs returns all runs for suite", "active", "medium"),
        ("test_get_run — GET /api/runs/{id} returns run with embedded test results", "active", "high"),
        ("test_update_result — PATCH /api/results/{id} records pass/fail/skip with notes", "active", "high"),
        ("test_run_completes_when_all_results_done — run.completed_at set after last result", "active", "high"),
    ]),
    ("E2E Smoke Tests — test_e2e.py", "Playwright · app loads, navigation, logo", [
        ("test_app_loads — logo, nav button, and sidebar visible on load", "active", "high"),
        ("test_projects_page_heading — Projects heading rendered on home page", "active", "high"),
        ("test_logo_navigates_to_projects — clicking logo returns to projects view", "active", "medium"),
    ]),
    ("E2E Project CRUD — test_e2e.py", "Playwright · project creation modal and table", [
        ("test_create_project — open modal, fill name, submit, verify project in table", "active", "high"),
        ("test_new_project_modal_opens — sidebar + button both open the modal", "active", "high"),
        ("test_nav_label_on_projects_page — nav button label shows New Project", "active", "low"),
    ]),
    ("E2E Suite & Test Case CRUD — test_e2e.py", "Playwright · suite and test case creation flows", [
        ("test_create_suite — navigate to project, open modal, create suite", "active", "high"),
        ("test_nav_label_on_project_page — nav button label shows New Suite", "active", "low"),
        ("test_create_test_case — open suite, add test case with status and priority", "active", "high"),
        ("test_nav_label_on_suite_page — nav button label shows New Test Case", "active", "low"),
    ]),
    ("E2E New Project Modal — test_e2e.py", "Playwright · modal form validation and dismiss", [
        ("test_new_project_modal_title — modal title text is New Project", "active", "medium"),
        ("test_new_project_modal_placeholders — name and description inputs have correct placeholders", "active", "medium"),
        ("test_new_project_modal_cancel — Cancel button closes modal overlay", "active", "medium"),
        ("test_new_project_modal_dismiss_x — X button dismisses modal overlay", "active", "medium"),
        ("test_new_project_modal_submit — submit creates project and modal closes", "active", "high"),
    ]),
    ("E2E Full Flow — test_e2e.py", "Playwright · end-to-end create project with timestamp", [
        ("test_create_project_with_timestamp — navigate, open modal, fill timestamped name, submit, verify", "active", "high"),
    ]),
    ("Page Objects — tests/e2e/pages/", "POM classes: BasePage, ProjectsPage, ProjectPage, SuitePage, NewProjectModal", [
        ("BasePage — logo, breadcrumb, nav-new-btn, sidebar-projects locators present", "active", "high"),
        ("BasePage — modal_overlay, modal_box, modal_title, modal_body locators present", "active", "high"),
        ("BasePage — toast_inner locator captures success and error messages", "active", "medium"),
        ("ProjectsPage — project_row locator finds row by project name", "active", "high"),
        ("ProjectsPage — delete_btn_for triggers confirm dialog and removes row", "active", "high"),
        ("ProjectPage — suite_card locator finds suite by name", "active", "high"),
        ("ProjectPage — stats cards (suites, cases, runs, pass rate) all accessible", "active", "medium"),
        ("SuitePage — test_case_card locator finds case by title", "active", "high"),
        ("SuitePage — start_run_btn and run_card accessible for run flows", "active", "medium"),
        ("NewProjectModal — name_input, description_input, create_btn, cancel_btn accessible", "active", "high"),
        ("All page objects use data-testid attributes as first-choice locator strategy", "active", "high"),
    ]),
]


@app.post("/api/demo/playwright", response_model=schemas.ProjectResponse)
def seed_demo_playwright(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    project = models.Project(
        name=f"TestFlow Repo — API & E2E Tests Demo {ts}",
        description="Actual pytest API tests and Playwright E2E tests from the TestFlow repository",
    )
    db.add(project)
    db.flush()

    for suite_name, suite_desc, cases in _PLAYWRIGHT_SUITES:
        suite = models.TestSuite(
            project_id=project.id,
            name=suite_name,
            description=suite_desc,
        )
        db.add(suite)
        db.flush()
        for title, status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project


# ─── Static files (must be last) ─────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    def _serve_index() -> HTMLResponse:
        """`FileResponse` derives its ETag/Last-Modified from filesystem stat
        info, not file content — on Vercel's build, index.html's mtime is
        frozen to a fixed date across every deployment, so a browser that
        already cached this page gets a false "304 Not Modified" on every
        later deploy and is stuck on stale markup (e.g. missing a new
        `<div id="view-...">` a newer app.js expects) until a hard refresh.
        `HTMLResponse` skips that conditional-request machinery entirely, so
        every request gets the real current file.
        """
        with open(os.path.join(static_dir, "index.html"), "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content, headers={"Cache-Control": "no-cache"})

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return _serve_index()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return _serve_index()
