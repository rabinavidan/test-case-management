"""Deployment environments and their simulated health (Environments dashboard)."""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..environment_health import simulate_environment_health as _simulate_environment_health

router = APIRouter()


# ─── Environments ─────────────────────────────────────────────────────────────
# This demo has no live cluster behind it (it runs on Vercel), so pod/node
# health below is synthetic telemetry standing in for a kubectl/metrics-server
# poll — deterministic within a 5-minute window so numbers don't jitter on
# every refresh, and closer to "healthy" for prod/preprod than for
# staging/regression, mirroring the stability gradient a real pipeline has.
# The simulation itself lives in api/environment_health.py so the triage
# agent (api/triage_agent.py) can read the same health signal.


@router.get("/api/environments", response_model=List[schemas.EnvironmentResponse])
def list_environments(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    envs = db.query(models.Environment).order_by(models.Environment.tier).all()
    return [
        schemas.EnvironmentResponse(
            id=e.id, key=e.key, name=e.name, tier=e.tier,
            namespace=e.namespace, node_name=e.node_name, region=e.region,
            **_simulate_environment_health(e.key),
        )
        for e in envs
    ]
