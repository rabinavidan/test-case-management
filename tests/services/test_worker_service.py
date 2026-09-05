"""services/worker/main.py - the runs.populate queue consumer.

Only handle_message is tested directly here: the reconnect/consume loop
around it (consume_forever) mirrors services/runs/events.py's
listen_for_ws_broadcasts shape, already covered for that pattern by
tests/services/test_ws_broadcast.py.
"""
from sqlalchemy.orm import Session

from conftest import import_service_app, reset_db

from services.runs import models

app, db_mod = import_service_app("runs")

import services.worker.main as worker_main  # noqa: E402 - after DATABASE_URL is wired above


def _make_run(db):
    run = models.TestRun(suite_id=1, name="R")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_handle_message_populates_results_and_broadcasts(monkeypatch):
    reset_db(db_mod)
    broadcasts = []
    monkeypatch.setattr(
        worker_main, "publish_ws_broadcast",
        lambda run_id, payload: broadcasts.append((run_id, payload)) or True,
    )

    with Session(db_mod.engine) as db:
        run = _make_run(db)

    worker_main.handle_message(run.id, [1, 2, 3])

    with Session(db_mod.engine) as db:
        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
    assert len(results) == 3
    assert all(r.status == "pending" for r in results)
    assert broadcasts == [(run.id, {"type": "results_populated", "run_id": run.id})]


def test_handle_message_is_safe_to_call_twice(monkeypatch):
    """At-least-once redelivery of the same message must not duplicate rows
    - relies on population.populate_pending_results' idempotency."""
    reset_db(db_mod)
    monkeypatch.setattr(worker_main, "publish_ws_broadcast", lambda run_id, payload: True)

    with Session(db_mod.engine) as db:
        run = _make_run(db)

    worker_main.handle_message(run.id, [1, 2])
    worker_main.handle_message(run.id, [1, 2])

    with Session(db_mod.engine) as db:
        results = db.query(models.TestResult).filter(models.TestResult.run_id == run.id).all()
    assert len(results) == 2
