"""Test suites: CRUD, CSV export and flaky-test detection."""
import csv
import io
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db

router = APIRouter()


# ─── Test Suites ─────────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/suites", response_model=List[schemas.TestSuiteResponse])
def list_suites(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return db.query(models.TestSuite).filter(
        models.TestSuite.project_id == project_id
    ).order_by(models.TestSuite.created_at.desc()).all()


@router.post("/api/projects/{project_id}/suites", response_model=schemas.TestSuiteResponse, status_code=201)
def create_suite(project_id: int, payload: schemas.TestSuiteCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    suite = models.TestSuite(project_id=project_id, **payload.model_dump())
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@router.get("/api/suites/{suite_id}", response_model=schemas.TestSuiteResponse)
def get_suite(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return suite


@router.delete("/api/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    db.delete(suite)
    db.commit()


def _csv_safe(value) -> str:
    """Neutralize CSV/formula injection: a value starting with =, +, -, or @
    can execute as a formula when the file is opened in Excel/Sheets — prefix
    it with a quote so spreadsheet apps render it as literal text instead."""
    s = "" if value is None else str(value)
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s


@router.get("/api/suites/{suite_id}/export/csv")
def export_suite_csv(suite_id: int, db: Session = Depends(get_db)):
    """One row per test case, with its most recent run result (across every
    run of this suite) — the "current status" view of the suite, not tied to
    any single run."""
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    test_cases = db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id
    ).order_by(models.TestCase.created_at.desc()).all()

    buffer = io.StringIO()
    buffer.write("﻿")  # UTF-8 BOM so Excel renders non-ASCII (e.g. Hebrew) text correctly
    writer = csv.writer(buffer)
    writer.writerow([
        "Test Case ID", "Title", "Priority", "Case Status", "Description",
        "Latest Run Name", "Latest Run Status", "Latest Run Date", "Environment", "Notes",
    ])

    for tc in test_cases:
        latest_result = (
            db.query(models.TestResult)
            .join(models.TestRun, models.TestResult.run_id == models.TestRun.id)
            .filter(models.TestResult.testcase_id == tc.id, models.TestRun.suite_id == suite_id)
            .order_by(models.TestRun.created_at.desc())
            .first()
        )
        run = latest_result.run if latest_result else None
        writer.writerow([
            tc.id,
            _csv_safe(tc.title),
            tc.priority,
            tc.status,
            _csv_safe(tc.description or ""),
            _csv_safe(run.name) if run else "",
            latest_result.status if latest_result else "no runs yet",
            latest_result.executed_at.isoformat() if latest_result and latest_result.executed_at else "",
            run.environment_name if run and run.environment_name else "",
            _csv_safe(latest_result.notes or "") if latest_result else "",
        ])

    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", suite.name).strip("_") or "suite"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}_export.csv"'},
    )


@router.get("/api/suites/{suite_id}/flaky-tests", response_model=schemas.FlakyTestsResponse)
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
