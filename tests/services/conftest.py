"""Shared fixtures for the microservices test layer (tests/services/).

Each service's models used to be declared with a Postgres-style
`__table_args__ = {"schema": ...}` (auth / projects / runs) — needed only
because the real deployment shares one Postgres instance across services
via separate schemas. Plain SQLite has no equivalent notion, so
`CREATE TABLE auth.users (...)` failed outright against a bare `sqlite:///`
engine; this file used to work around that with SQLite's
`ATTACH DATABASE ... AS <schema>`. Models are now table-name-prefixed
instead (`auth_users`, `projects_projects`, ...) rather than
schema-qualified, so that workaround is gone — a plain SQLite file backs
each service's tests directly, same as the monolith's tests/api/conftest.py.

`import_service_app()` below imports one service (`services.<service>.main`)
against a throwaway SQLite file, first pointing `DATABASE_URL` at it so the
module's own `Base.metadata.create_all(bind=engine)` (which runs at import
time) creates tables there instead of the service's real default path. This
happens at each test *module's* import time (collection), before any
fixture runs — so it uses `tempfile` directly rather than the
`tmp_path_factory` fixture, which isn't available yet at that point.
"""
import importlib
import os
import pathlib
import tempfile
import time
import hashlib
import hmac
import json
import base64

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "services-test-secret-key")


def import_service_app(service: str):
    """Import `services.<service>.main` against a throwaway SQLite file.
    Safe to call more than once per session for the same service (subsequent
    calls just reuse the cached module/engine).
    """
    db_module_name = f"services.{service}.database"
    main_module_name = f"services.{service}.main"

    if main_module_name in importlib.sys.modules:
        main_mod = importlib.sys.modules[main_module_name]
        db_mod = importlib.sys.modules[db_module_name]
        return main_mod.app, db_mod

    main_db_path = pathlib.Path(tempfile.mkdtemp(prefix=f"testflow_{service}_")) / "main.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{main_db_path}"

    db_mod = importlib.import_module(db_module_name)
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
    """Mint a token using the same HMAC-SHA256 scheme services.common.jwt
    (the single shared verifier every service now imports) expects — lets
    tests for projects/runs/ai authenticate without spinning up the auth
    service.
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
