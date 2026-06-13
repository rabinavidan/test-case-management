from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import os

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
