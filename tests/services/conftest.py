"""Shared fixtures for the microservices test layer (tests/services/).

Each service's models are declared with a Postgres-style `__table_args__ =
{"schema": ...}` (auth / projects / runs) — needed for the real deployment,
where all five services share one Postgres instance via separate schemas.
Plain SQLite has no equivalent notion, so `CREATE TABLE auth.users (...)`
fails outright against a bare `sqlite:///` engine (confirmed: this is
*why* these services had zero tests before this file existed — the same
DB-setup trick the monolith's tests/api/conftest.py uses doesn't apply
as-is). The fix is SQLite's `ATTACH DATABASE ... AS <schema>`, registered
on the engine's `connect` event so every connection gets it automatically.

`import_service_app()` below does this for one service: point its
`DATABASE_URL` at a throwaway file *before* importing `<service>.main`
(whose module-level `Base.metadata.create_all(bind=engine)` runs at import
time, so the attach hook must exist before that import happens), then
import it and return the FastAPI app plus its `database` module. This
happens at each test *module's* import time (collection), before any
fixture runs — so it uses `tempfile` directly rather than the
`tmp_path_factory` fixture, which isn't available yet at that point.
"""
import importlib
import os
import tempfile
import time
import hashlib
import hmac
import json
import base64
import pathlib

import pytest
from sqlalchemy import event

os.environ.setdefault("JWT_SECRET_KEY", "services-test-secret-key")


def import_service_app(service: str):
    """Import `services.<service>.main`, wiring its engine to throwaway SQLite
    files via the ATTACH trick. Safe to call more than once per session for
    the same service (subsequent calls just reuse the cached module/engine).
    """
    db_module_name = f"services.{service}.database"
    main_module_name = f"services.{service}.main"

    if main_module_name in importlib.sys.modules:
        main_mod = importlib.sys.modules[main_module_name]
        db_mod = importlib.sys.modules[db_module_name]
        return main_mod.app, db_mod

    tmp_dir = pathlib.Path(tempfile.mkdtemp(prefix=f"testflow_{service}_"))
    main_db_path = tmp_dir / "main.db"
    schema_db_path = tmp_dir / f"{service}.db"

    os.environ["DATABASE_URL"] = f"sqlite:///{main_db_path}"

    db_mod = importlib.import_module(db_module_name)

    @event.listens_for(db_mod.engine, "connect")
    def _attach_schema(dbapi_conn, _connection_record):
        dbapi_conn.execute(f"ATTACH DATABASE '{schema_db_path}' AS {service}")

    main_mod = importlib.import_module(main_module_name)
    return main_mod.app, db_mod


def reset_db(db_mod):
    """Drop and recreate every table on a service's (already schema-attached)
    engine — the tests/services/ equivalent of tests/api/conftest.py's
    per-test setup_db fixture."""
    db_mod.Base.metadata.drop_all(bind=db_mod.engine)
    db_mod.Base.metadata.create_all(bind=db_mod.engine)


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint_token(user_id: int, role: str = "admin", ttl: int = 3600) -> str:
    """Mint a token using the same HMAC-SHA256 scheme every service's
    verifier (services/_shared_auth.py, services/auth/auth.py) expects —
    lets tests for projects/runs/ai authenticate without spinning up the
    auth service.
    """
    secret = os.environ["JWT_SECRET_KEY"].encode()
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64e(json.dumps({
        "sub": str(user_id), "role": role, "exp": int(time.time()) + ttl,
    }).encode())
    sig = _b64e(hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


@pytest.fixture()
def auth_headers():
    return {"Authorization": f"Bearer {mint_token(1, 'admin')}"}


@pytest.fixture()
def executor_headers():
    return {"Authorization": f"Bearer {mint_token(2, 'executor')}"}
