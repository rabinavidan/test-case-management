"""Creates the pending TestResult rows for a newly created TestRun.

Split out of create_run's request handler (services/runs/main.py) so the
insert logic exists exactly once regardless of who runs it: main.py calls
this inline when Redis is unreachable (see events.enqueue_run_population),
and services/worker's queue consumer calls it for the normal, asynchronous
path.
"""
from sqlalchemy.orm import Session

from . import models


def populate_pending_results(db: Session, run_id: int, testcase_ids: list[int]) -> None:
    """No-ops if `run_id` already has results, so this is safe to call twice
    for the same run - a worker's at-least-once redelivery of a message it
    already finished processing must not duplicate rows."""
    already_populated = db.query(models.TestResult.id).filter(
        models.TestResult.run_id == run_id
    ).first()
    if already_populated:
        return
    for testcase_id in testcase_ids:
        db.add(models.TestResult(run_id=run_id, testcase_id=testcase_id, status="pending"))
    db.commit()
