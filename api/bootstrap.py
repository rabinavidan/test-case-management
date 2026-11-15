"""Database bootstrap, run once at import: create tables, apply lightweight
migrations, seed the admin user and the deployment environments."""
import os
import time

from sqlalchemy.exc import OperationalError

from . import models
from .auth import hash_password
from .database import Base, engine


def _with_db_retry(func, attempts=3, base_delay=0.5):
    """Retry a DB call on transient connection errors (e.g. Neon's pooler
    briefly rejecting a burst of simultaneous cold-start connections)."""
    for attempt in range(attempts):
        try:
            return func()
        except OperationalError:
            if attempt == attempts - 1:
                raise
            time.sleep(base_delay * (2 ** attempt))


# Create all tables
_with_db_retry(lambda: Base.metadata.create_all(bind=engine))


# Migrate: add columns that may be missing from older deployments
def _run_migrations():
    try:
        with _with_db_retry(lambda: engine.connect()) as conn:
            from sqlalchemy import text
            for stmt in [
                "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'executor'",
                "ALTER TABLE test_runs ADD COLUMN created_by_id INTEGER REFERENCES users(id)",
                "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
                "ALTER TABLE test_runs ADD COLUMN environment_id INTEGER REFERENCES environments(id)",
                "ALTER TABLE test_case_embeddings ADD COLUMN embedding_model VARCHAR(100)",
            ]:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    conn.rollback()
    except Exception:
        pass


_run_migrations()


# Seed/update admin user from env vars at module load time (runs on every cold start)
def _seed_admin():
    seed_user = os.getenv("SEED_ADMIN_USERNAME")
    seed_pass = os.getenv("SEED_ADMIN_PASSWORD")
    seed_email = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
    if not seed_user or not seed_pass:
        return
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            existing = _with_db_retry(
                lambda: db.query(models.User).filter(models.User.username == seed_user).first()
            )
            if existing:
                # Update password and ensure admin role
                existing.hashed_password = hash_password(seed_pass)
                existing.role = "admin"
            else:
                db.add(models.User(
                    username=seed_user,
                    email=seed_email,
                    hashed_password=hash_password(seed_pass),
                    role="admin",
                ))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


_seed_admin()


# Seed the fixed 4-environment pipeline (staging -> regression -> preprod ->
# prod) at module load time, matching k8s/overlays/*. Idempotent: only
# inserts rows whose key is missing, never overwrites an existing row (an
# operator may have hand-edited node_name/namespace to match a real cluster).
_ENVIRONMENT_SEED = [
    {"key": "staging",    "name": "Staging",    "tier": 1, "namespace": "testflow-staging",    "node_name": "node-staging-1",    "region": "us-east-1"},
    {"key": "regression", "name": "Regression", "tier": 2, "namespace": "testflow-regression", "node_name": "node-regression-1", "region": "us-east-1"},
    {"key": "preprod",    "name": "Preprod",    "tier": 3, "namespace": "testflow-preprod",    "node_name": "node-preprod-1",    "region": "us-west-2"},
    {"key": "prod",       "name": "Prod",       "tier": 4, "namespace": "testflow-prod",       "node_name": "node-prod-1",       "region": "us-west-2"},
]


def _seed_environments():
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            existing_keys = {e.key for e in _with_db_retry(lambda: db.query(models.Environment).all())}
            for env in _ENVIRONMENT_SEED:
                if env["key"] not in existing_keys:
                    db.add(models.Environment(**env))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


_seed_environments()
