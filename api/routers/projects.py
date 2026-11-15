"""Projects: CRUD, analytics and the stats shown on the project page."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db

router = APIRouter()


# ─── Projects ────────────────────────────────────────────────────────────────

@router.get("/api/projects", response_model=schemas.PaginatedProjects)
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


@router.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/api/projects/{project_id}", response_model=schemas.ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()


# ─── Analytics ────────────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/analytics", response_model=schemas.ProjectAnalytics)
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

@router.get("/api/projects/{project_id}/stats", response_model=schemas.ProjectStats)
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
