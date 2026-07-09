import os, random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import httpx

from .database import engine, get_db, Base
from . import models, schemas
from .auth import get_current_user, require_admin, UserClaims

Base.metadata.create_all(bind=engine)

RUNS_SERVICE_URL = os.getenv("RUNS_SERVICE_URL", "http://runs:8003")

app = FastAPI(title="Projects Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "projects"}


# ─── Internal endpoints (called by other services) ────────────────────────────

@app.get("/internal/suites/{suite_id}/active-testcases")
def internal_active_testcases(suite_id: int, db: Session = Depends(get_db)):
    cases = db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id,
        models.TestCase.status == "active",
    ).all()
    return [{"id": tc.id} for tc in cases]


@app.get("/internal/suites/{suite_id}")
def internal_get_suite(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(404, "Suite not found")
    return {"id": suite.id, "name": suite.name, "project_id": suite.project_id}


# ─── Projects ─────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=schemas.PaginatedProjects)
def list_projects(db: Session = Depends(get_db),
                  page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  search: Optional[str] = Query(None)):
    q = db.query(models.Project)
    if search:
        q = q.filter(models.Project.name.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(models.Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return schemas.PaginatedProjects(items=items, total=total, page=page, page_size=page_size,
                                     total_pages=max(1, (total + page_size - 1) // page_size))


@app.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db),
                   _: UserClaims = Depends(require_admin)):
    p = models.Project(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db),
                   _: UserClaims = Depends(require_admin)):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    db.commit()


# ─── Test Suites ──────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/suites", response_model=List[schemas.TestSuiteResponse])
def list_suites(project_id: int, db: Session = Depends(get_db)):
    if not db.query(models.Project).filter(models.Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    return db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id)\
             .order_by(models.TestSuite.created_at.desc()).all()


@app.post("/api/projects/{project_id}/suites", response_model=schemas.TestSuiteResponse, status_code=201)
def create_suite(project_id: int, payload: schemas.TestSuiteCreate, db: Session = Depends(get_db),
                 _: UserClaims = Depends(require_admin)):
    if not db.query(models.Project).filter(models.Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    suite = models.TestSuite(project_id=project_id, **payload.model_dump())
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@app.delete("/api/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: int, db: Session = Depends(get_db), _: UserClaims = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(404, "Suite not found")
    db.delete(suite)
    db.commit()


# ─── Test Cases ───────────────────────────────────────────────────────────────

@app.get("/api/suites/{suite_id}/testcases", response_model=List[schemas.TestCaseResponse])
def list_testcases(suite_id: int, db: Session = Depends(get_db)):
    if not db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first():
        raise HTTPException(404, "Suite not found")
    return db.query(models.TestCase).filter(models.TestCase.suite_id == suite_id)\
             .order_by(models.TestCase.created_at.desc()).all()


@app.post("/api/suites/{suite_id}/testcases", response_model=schemas.TestCaseResponse, status_code=201)
def create_testcase(suite_id: int, payload: schemas.TestCaseCreate, db: Session = Depends(get_db),
                    _: UserClaims = Depends(require_admin)):
    if not db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first():
        raise HTTPException(404, "Suite not found")
    tc = models.TestCase(suite_id=suite_id, **payload.model_dump())
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@app.put("/api/testcases/{tc_id}", response_model=schemas.TestCaseResponse)
def update_testcase(tc_id: int, payload: schemas.TestCaseUpdate, db: Session = Depends(get_db),
                    _: UserClaims = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(404, "Test case not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tc, field, value)
    db.commit()
    db.refresh(tc)
    return tc


@app.delete("/api/testcases/{tc_id}", status_code=204)
def delete_testcase(tc_id: int, db: Session = Depends(get_db), _: UserClaims = Depends(require_admin)):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(404, "Test case not found")
    db.delete(tc)
    db.commit()


# ─── Bulk-save AI-generated test cases ────────────────────────────────────────

@app.post("/api/suites/{suite_id}/testcases/generate/save")
def save_generated(suite_id: int, payload: List[schemas.AIGeneratedTestCase],
                   db: Session = Depends(get_db), _: UserClaims = Depends(require_admin)):
    if not db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first():
        raise HTTPException(404, "Suite not found")
    created = []
    for tc in payload:
        obj = models.TestCase(suite_id=suite_id, status="draft", **tc.model_dump())
        db.add(obj)
        created.append(obj)
    db.commit()
    for obj in created:
        db.refresh(obj)
    return {"saved": len(created)}


# ─── Stats (calls runs service for last-run data) ─────────────────────────────

@app.get("/api/projects/{project_id}/stats", response_model=schemas.ProjectStats)
def project_stats(project_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    suite_ids = [s.id for s in suites]
    total_cases = db.query(models.TestCase).filter(models.TestCase.suite_id.in_(suite_ids)).count() if suite_ids else 0

    run_stats = {"total_runs": 0, "last_run_pass": 0, "last_run_fail": 0,
                 "last_run_skip": 0, "last_run_pending": 0, "last_run_name": None}
    if suite_ids:
        try:
            resp = httpx.get(f"{RUNS_SERVICE_URL}/internal/projects/last-run-stats",
                             params={"suite_ids": ",".join(map(str, suite_ids))}, timeout=5)
            if resp.status_code == 200:
                run_stats.update(resp.json())
        except Exception:
            pass

    return schemas.ProjectStats(total_suites=len(suites), total_cases=total_cases, **run_stats)


# ─── Analytics (calls runs service for run history) ───────────────────────────

@app.get("/api/projects/{project_id}/analytics", response_model=schemas.ProjectAnalytics)
def project_analytics(project_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    suites = db.query(models.TestSuite).filter(models.TestSuite.project_id == project_id).all()
    suite_ids = [s.id for s in suites]

    run_history = []
    if suite_ids:
        try:
            resp = httpx.get(f"{RUNS_SERVICE_URL}/internal/projects/run-history",
                             params={"suite_ids": ",".join(map(str, suite_ids))}, timeout=5)
            if resp.status_code == 200:
                run_history = [schemas.RunDataPoint(**r) for r in resp.json()]
        except Exception:
            pass

    suite_coverage = []
    for suite in suites:
        total = db.query(models.TestCase).filter(models.TestCase.suite_id == suite.id).count()
        active = db.query(models.TestCase).filter(models.TestCase.suite_id == suite.id,
                                                   models.TestCase.status == "active").count()
        suite_coverage.append({"suite_name": suite.name, "total": total, "active": active})

    return schemas.ProjectAnalytics(project_id=project_id, project_name=p.name,
                                    run_history=run_history, suite_coverage=suite_coverage)


# ─── Demo seed data ───────────────────────────────────────────────────────────

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
        ("Alert severity mapped correctly", "active", "medium"),
    ]),
    ("Notification Engine", "Notification dispatch orchestration", [
        ("Notification routed to correct channel", "active", "high"),
        ("UI-only alert does not trigger email", "active", "high"),
        ("Daily digest batches alerts correctly", "active", "medium"),
        ("Failed notification retried up to 3 times", "active", "medium"),
    ]),
]

_TESTFLOW_SUITES = [
    ("Project Management", "Create, edit, and delete projects", [
        ("Create project with name and description", "active", "high"),
        ("Project name is required on creation", "active", "high"),
        ("Delete project removes all suites and cases", "active", "high"),
        ("Project list shows newest first", "active", "medium"),
    ]),
    ("Test Suite Management", "Create, list, and delete test suites", [
        ("Create suite within a project", "active", "high"),
        ("Suite name is required", "active", "high"),
        ("Delete suite removes all test cases", "active", "high"),
    ]),
    ("Test Run Execution", "Start runs and record results", [
        ("Create run generates pending results for active cases", "active", "high"),
        ("Mark result as pass updates run status", "active", "high"),
        ("Run marked complete when all results non-pending", "active", "high"),
    ]),
]


def _create_project_with_suites(db, name, description, suites_data):
    p = models.Project(name=name, description=description)
    db.add(p)
    db.flush()
    for suite_name, suite_desc, cases in suites_data:
        suite = models.TestSuite(project_id=p.id, name=suite_name, description=suite_desc)
        db.add(suite)
        db.flush()
        for title, status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title, status=status, priority=priority))
    db.commit()
    db.refresh(p)
    # Ask runs service to seed demo runs
    suite_ids = [s.id for s in db.query(models.TestSuite).filter(models.TestSuite.project_id == p.id).all()]
    try:
        httpx.post(f"{RUNS_SERVICE_URL}/internal/demo/seed-runs",
                   json={"suite_ids": suite_ids}, timeout=10)
    except Exception:
        pass
    return p


@app.post("/api/demo/alerts-microservice", response_model=schemas.ProjectResponse)
def demo_alerts(db: Session = Depends(get_db), _: UserClaims = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    return _create_project_with_suites(db, f"Alerts Microservice {ts}",
                                       "Alerts Microservice with Kafka, MongoDB, Elasticsearch, etc.",
                                       _DEMO_SUITES)


@app.post("/api/demo/testflow", response_model=schemas.ProjectResponse)
def demo_testflow(db: Session = Depends(get_db), _: UserClaims = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    return _create_project_with_suites(db, f"TestFlow {ts}",
                                       "TestFlow — test case management app (FastAPI + Vanilla JS)",
                                       _TESTFLOW_SUITES)


@app.post("/api/demo/playwright", response_model=schemas.ProjectResponse)
def demo_playwright(db: Session = Depends(get_db), _: UserClaims = Depends(get_current_user)):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    return _create_project_with_suites(db, f"TestFlow Repo — API & E2E Tests Demo {ts}",
                                       "Actual pytest API tests and Playwright E2E tests from the TestFlow repository",
                                       _TESTFLOW_SUITES)
