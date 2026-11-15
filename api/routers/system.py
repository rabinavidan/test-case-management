"""System endpoints: version, CI pipeline stats, debug seed."""
import os
from datetime import datetime, timedelta
from typing import Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import hash_password
from ..database import get_db
from ..settings import VERSION

router = APIRouter()


# ─── Auth ─────────────────────────────────────────────────────────────────────

@router.get("/api/version")
def get_version():
    return {"version": VERSION}


@router.get("/api/debug/seed")
def debug_seed(db: Session = Depends(get_db)):
    import traceback
    seed_user = os.getenv("SEED_ADMIN_USERNAME")
    seed_pass = os.getenv("SEED_ADMIN_PASSWORD")
    result = {
        "env_username_set": bool(seed_user),
        "env_password_set": bool(seed_pass),
        "user_count": 0,
        "admin_exists": False,
        "seed_error": None,
    }
    try:
        result["user_count"] = db.query(models.User).count()
        if seed_user:
            result["admin_exists"] = db.query(models.User).filter(models.User.username == seed_user).count() > 0
        # Try running seed inline
        if seed_user and seed_pass:
            existing = db.query(models.User).filter(models.User.username == seed_user).first()
            if existing:
                existing.hashed_password = hash_password(seed_pass)
                existing.role = "admin"
            else:
                db.add(models.User(
                    username=seed_user,
                    email=os.getenv("SEED_ADMIN_EMAIL", "admin@example.com"),
                    hashed_password=hash_password(seed_pass),
                    role="admin",
                ))
            db.commit()
            result["seeded"] = True
    except Exception:
        result["seed_error"] = traceback.format_exc()
    return result


# ─── CI pipeline metrics ───────────────────────────────────────────────────────

CI_GITHUB_REPO = "rabinavidan/test-case-management"


CI_WORKFLOW_FILE = "test.yml"  # the required "Tests" workflow — lint + pytest + coverage gate


CI_PIPELINE_STATS_CACHE_TTL = timedelta(minutes=30)


_ci_pipeline_stats_cache: Dict[str, object] = {"data": None, "fetched_at": None}


@router.get("/api/ci/pipeline-stats")
def ci_pipeline_stats():
    """Real per-run duration for this repo's required "Tests" CI workflow,
    fetched live from the public GitHub Actions API (no token configured for
    this deployment, so unauthenticated — fine for a public repo's run list).
    Cached in-process for CI_PIPELINE_STATS_CACHE_TTL so repeated homepage
    loads don't re-hit GitHub's unauthenticated rate limit. On any failure
    (network, rate limit, no completed runs yet) the duration fields stay
    None rather than falling back to a guessed number — same "Not yet
    measured beats a wrong number" contract as scripts/heal_metrics.py and
    scripts/ai_call_metrics.py."""
    now = datetime.utcnow()
    cached = _ci_pipeline_stats_cache["data"]
    fetched_at = _ci_pipeline_stats_cache["fetched_at"]
    if cached is not None and fetched_at is not None and now - fetched_at < CI_PIPELINE_STATS_CACHE_TTL:
        return cached

    result = {
        "workflow": "Tests",
        "runs_sampled": 0,
        "mean_duration_seconds": None,
        "median_duration_seconds": None,
    }
    try:
        import statistics

        import httpx
        resp = httpx.get(
            f"https://api.github.com/repos/{CI_GITHUB_REPO}/actions/workflows/{CI_WORKFLOW_FILE}/runs",
            params={"status": "completed", "branch": "main", "per_page": 20},
            headers={"Accept": "application/vnd.github+json"},
            timeout=5.0,
        )
        resp.raise_for_status()
        durations = []
        for run in resp.json().get("workflow_runs", []):
            started, updated = run.get("run_started_at"), run.get("updated_at")
            if not started or not updated:
                continue
            seconds = (
                datetime.fromisoformat(updated.replace("Z", "+00:00"))
                - datetime.fromisoformat(started.replace("Z", "+00:00"))
            ).total_seconds()
            if seconds > 0:
                durations.append(seconds)
        if durations:
            result["runs_sampled"] = len(durations)
            result["mean_duration_seconds"] = round(statistics.mean(durations), 1)
            result["median_duration_seconds"] = round(statistics.median(durations), 1)
    except Exception:
        pass  # GitHub API unreachable/rate-limited - keep the "not measured" defaults

    _ci_pipeline_stats_cache["data"] = result
    _ci_pipeline_stats_cache["fetched_at"] = now
    return result
