from fastapi import FastAPI, Depends, HTTPException
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

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Test Case Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Projects ────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


@app.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
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
def create_suite(project_id: int, payload: schemas.TestSuiteCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    suite = models.TestSuite(project_id=project_id, **payload.model_dump())
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@app.delete("/api/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: int, db: Session = Depends(get_db)):
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
def create_testcase(suite_id: int, payload: schemas.TestCaseCreate, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    tc = models.TestCase(suite_id=suite_id, **payload.model_dump())
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@app.put("/api/testcases/{tc_id}", response_model=schemas.TestCaseResponse)
def update_testcase(tc_id: int, payload: schemas.TestCaseUpdate, db: Session = Depends(get_db)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@app.delete("/api/testcases/{tc_id}", status_code=204)
def delete_testcase(tc_id: int, db: Session = Depends(get_db)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    db.delete(tc)
    db.commit()


# ─── Test Runs ────────────────────────────────────────────────────────────────

@app.post("/api/suites/{suite_id}/runs", response_model=schemas.TestRunResponse, status_code=201)
def create_run(suite_id: int, payload: schemas.TestRunCreate, db: Session = Depends(get_db)):
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
def update_result(run_id: int, tc_id: int, payload: schemas.TestResultUpdate, db: Session = Depends(get_db)):
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
def seed_demo_alerts_microservice(db: Session = Depends(get_db)):
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
def seed_demo_testflow(db: Session = Depends(get_db)):
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
