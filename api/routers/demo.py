"""One-click demo projects for the guest tour (data in api/demo_data.py)."""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..demo_data import _DEMO_SUITES, _PLAYWRIGHT_SUITES, _TESTFLOW_SUITES, _seed_demo_runs

router = APIRouter()


@router.post("/api/demo/alerts-microservice", response_model=schemas.ProjectResponse)
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
        for title, case_status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=case_status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project


@router.post("/api/demo/testflow", response_model=schemas.ProjectResponse)
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
        for title, case_status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=case_status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project


@router.post("/api/demo/playwright", response_model=schemas.ProjectResponse)
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
        for title, case_status, priority in cases:
            db.add(models.TestCase(suite_id=suite.id, title=title,
                                   status=case_status, priority=priority))

    db.flush()
    _seed_demo_runs(db, project.id)
    db.commit()
    db.refresh(project)
    return project
