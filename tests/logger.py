"""
Playwright test logger — structured, timestamped step logging.

Usage:
    from tests.logger import PWLogger
    log = PWLogger("MyTest")
    log.step("Navigate to projects page")
    log.action("click", "New Project button")
    log.assert_("project card visible", "PW Suite Project")
    log.info("arbitrary message")
    log.error("something went wrong")
    log.section("Suite CRUD")   # prints a visual separator
"""
import logging
import sys
from datetime import datetime


# ── Setup root logger once ────────────────────────────────────────────────────

_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(
    logging.Formatter("%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
                      datefmt="%H:%M:%S")
)

_root = logging.getLogger("pw")
if not _root.handlers:
    _root.addHandler(_handler)
_root.setLevel(logging.DEBUG)
_root.propagate = False


# ── Logger wrapper ────────────────────────────────────────────────────────────

class PWLogger:
    """Structured step logger for Playwright page objects and tests."""

    def __init__(self, name: str):
        self._log = logging.getLogger(f"pw.{name}")

    # ── Public API ────────────────────────────────────────────────────────────

    def section(self, title: str) -> None:
        """Print a visual separator to mark a new logical section."""
        bar = "─" * 60
        self._log.info(f"\n{bar}\n  {title}\n{bar}")

    def step(self, description: str) -> None:
        """High-level test step (maps to a test action sentence)."""
        self._log.info(f"STEP  ▶  {description}")

    def action(self, verb: str, target: str, value: str = "") -> None:
        """Low-level UI action (click, fill, hover, …)."""
        detail = f" → '{value}'" if value else ""
        self._log.debug(f"     {verb.upper():8s}  {target}{detail}")

    def assert_(self, description: str, value: str = "") -> None:
        """Log an assertion / expectation check."""
        detail = f": '{value}'" if value else ""
        self._log.info(f"ASSERT  ✔  {description}{detail}")

    def navigate(self, url: str) -> None:
        self._log.info(f"     GOTO      {url}")

    def info(self, msg: str) -> None:
        self._log.info(msg)

    def warning(self, msg: str) -> None:
        self._log.warning(msg)

    def error(self, msg: str) -> None:
        self._log.error(msg)
