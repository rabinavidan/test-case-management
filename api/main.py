from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
import os
import random

from .database import engine, get_db, Base
from . import models, schemas
from .auth import hash_password, verify_password, create_access_token, get_current_user, require_admin

# Create all tables
Base.metadata.create_all(bind=engine)

# Auto-seed admin user from env vars if no users exist
def _seed_admin():
    seed_user = os.getenv("SEED_ADMIN_USERNAME")
    seed_pass = os.getenv("SEED_ADMIN_PASSWORD")
    seed_email = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
    if not seed_user or not seed_pass:
        return
    from .database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            db.add(models.User(
                username=seed_user,
                email=seed_email,
                hashed_password=hash_password(seed_pass),
                role="admin",
            ))
            db.commit()
    finally:
        db.close()

_seed_admin()

app = FastAPI(title="Test Case Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth ─────────────────────────────────────────────────────────────────────

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


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(body: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": create_access_token(user.id), "user": user}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ─── Projects ────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


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
    for field, value in payload.model_dump(exclude_unset=True).items():
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
def create_run(suite_id: int, payload: schemas.TestRunCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    run = models.TestRun(suite_id=suite_id, name=payload.name)
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
def update_result(run_id: int, tc_id: int, payload: schemas.TestResultUpdate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    result = db.query(models.TestResult).filter(
        models.TestResult.run_id == run_id,
        models.TestResult.testcase_id == tc_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result.status = payload.status
    result.notes = payload.notes
    result.executed_at = datetime.utcnow()

    # Check if all results are done; if so, mark run complete
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    all_results = db.query(models.TestResult).filter(models.TestResult.run_id == run_id).all()
    if all(r.status != "pending" for r in all_results):
        run.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)
    return {"id": result.id, "status": result.status, "notes": result.notes}


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/stats", response_model=schemas.ProjectStats)
def project_stats(project_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
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
    ("Page Objects — tests/pages/", "POM classes: BasePage, ProjectsPage, ProjectPage, SuitePage, NewProjectModal", [
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

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(os.path.join(static_dir, "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(static_dir, "index.html")
        return FileResponse(index)
