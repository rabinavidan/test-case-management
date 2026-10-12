"""Health endpoints shared by every HTTP service.

Liveness and readiness answer different questions and are kept apart on
purpose:

- `/health/live` (and the original `/health`, kept for anything already
  polling it) only says "this process is up and serving". It never touches
  a dependency: if it checked the database, a database outage would fail
  every replica's liveness probe at once and Kubernetes would restart them
  all in a loop — turning one outage into two.
- `/health/ready` checks the dependencies a service can't do its job
  without (its database). Failing it takes the pod out of the Service's
  endpoints until the dependency is back, without restarting anything.
  Dependencies a service already degrades gracefully without (Redis,
  Kafka — see services/README.md) are deliberately not checked here.

The worker has no HTTP surface — its liveness check lives in
services/common/heartbeat.py instead.
"""
from typing import Callable

from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.engine import Engine


def health_response(service_name: str) -> dict:
    return {"status": "ok", "service": service_name}


def database_check(engine: Engine) -> Callable[[], bool]:
    def check() -> bool:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False
    return check


def readiness_response(service_name: str, checks: dict[str, Callable[[], bool]]) -> JSONResponse:
    results = {name: ("ok" if check() else "fail") for name, check in checks.items()}
    ready = all(r == "ok" for r in results.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ok" if ready else "fail", "service": service_name, "checks": results},
    )
