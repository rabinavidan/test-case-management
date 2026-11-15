"""Root conftest — shared across all test layers (unit / api / contract / services / infra).

Layer-specific fixtures live in each layer's own conftest.py:
  tests/backend/unit/     — none needed (pure functions, no fixtures)
  tests/backend/api/      — DB engine + TestClient/auth fixtures (tests/backend/api/conftest.py)
  tests/backend/contract/ — DB engine + auth setup inline (schemathesis owns the test loop)
  tests/backend/services/ — per-service SQLite-with-attached-schema engines + JWT minting
                    (tests/backend/services/conftest.py) — covers the microservices under
                    services/, which tests/backend/api/ and tests/backend/contract/ don't touch
  tests/infra/    — kustomize render of the kind-lab overlays (needs kubectl)
"""
import atexit
import logging
import os
import pathlib
import shutil
import tempfile

# Set before any test module imports api.main / services.auth.main, so the
# rate limiter those modules construct at import time picks this up. Without
# it, tests/backend/contract's Schemathesis fuzzing of /api/auth/register and
# /api/auth/login (many requests per operation, single test) and the
# hundreds of register/login calls across tests/backend/api and tests/backend/services would
# trip the same production brute-force limit.
os.environ.setdefault("TESTFLOW_DISABLE_RATE_LIMIT", "1")

# Importing api.main creates its tables at import time; without this the
# default engine would write ./testcases.db into the repo root on every run.
# One throwaway directory per test process (xdist workers are processes).
TEST_TMP_DIR = tempfile.mkdtemp(prefix="testflow-tests-")
atexit.register(shutil.rmtree, TEST_TMP_DIR, ignore_errors=True)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_TMP_DIR}/app_default.db")


def tmp_sqlite_url(name: str) -> str:
    """A SQLite URL inside this process's throwaway directory."""
    return f"sqlite:///{os.path.join(TEST_TMP_DIR, name)}"

_pw_log = logging.getLogger("pw.hook")


def pytest_runtest_logreport(report):
    """Surface full failure details in the pw.* log stream immediately on failure."""
    if report.failed:
        longrepr = str(report.longrepr) if report.longrepr else "(no details)"
        _pw_log.error(
            "\n"
            + "━" * 70 + "\n"
            + f"  ❌  FAILED [{report.when.upper()}]  {report.nodeid}\n"
            + "━" * 70 + "\n"
            + longrepr + "\n"
            + "━" * 70
        )


def pytest_collection_modifyitems(config, items):
    """Auto-tag each test with a layer marker based on its directory, so
    `pytest -m api` (etc.) works without per-test markers:
    tests/backend/<unit|api|contract|services>/ -> that layer;
    tests/tooling/ -> tooling; tests/infra/ -> infra.
    """
    root = pathlib.Path(config.rootdir) / "tests"
    for item in items:
        try:
            relative = pathlib.Path(str(item.fspath)).relative_to(root)
        except ValueError:
            continue
        parts = relative.parts
        layer = parts[1] if parts[:1] == ("backend",) and len(parts) > 2 else (parts[0] if parts else None)
        if layer in ("unit", "api", "contract", "services", "tooling", "infra"):
            item.add_marker(layer)
