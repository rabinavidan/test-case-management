"""Root conftest — shared across all test layers (unit / api / e2e).

Layer-specific fixtures live in each layer's own conftest.py:
  tests/unit/  — none needed (pure functions, no fixtures)
  tests/api/   — DB engine + TestClient/auth fixtures (tests/api/conftest.py)
  tests/e2e/   — Playwright browser fixtures live inline per test module
"""
import logging
import pathlib

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
    """Auto-tag each test with a layer marker (unit/api/e2e) based on its
    directory, so `pytest -m api` (etc.) works without per-test markers.
    """
    root = pathlib.Path(config.rootdir) / "tests"
    for item in items:
        try:
            relative = pathlib.Path(str(item.fspath)).relative_to(root)
        except ValueError:
            continue
        layer = relative.parts[0] if relative.parts else None
        if layer in ("unit", "api", "e2e"):
            item.add_marker(layer)
