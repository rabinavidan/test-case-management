"""services/runs/population.py - shared between services/runs/main.py's
inline fallback (Redis unreachable) and services/worker's queue consumer
(the normal path), so it's tested once here regardless of caller.
"""
from sqlalchemy.orm import Session

from conftest import import_service_app, reset_db

from services.runs import models, population

app, db_mod = import_service_app("runs")


def _make_run(db):
    run = models.TestRun(suite_id=1, name="R")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_populate_pending_results_creates_one_row_per_testcase():
    reset_db(db_mod)
    with Session(db_mod.engine) as db:
        run = _make_run(db)
        population.populate_pending_results(db, run.id, [10, 20, 30])
        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
        assert len(results) == 3
        assert all(r.status == "pending" for r in results)


def test_populate_pending_results_is_idempotent():
    """A worker's at-least-once redelivery of the same message must not
    duplicate rows."""
    reset_db(db_mod)
    with Session(db_mod.engine) as db:
        run = _make_run(db)
        population.populate_pending_results(db, run.id, [10, 20])
        population.populate_pending_results(db, run.id, [10, 20])  # redelivered

        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
        assert len(results) == 2
