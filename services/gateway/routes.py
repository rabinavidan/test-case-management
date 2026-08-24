"""Declarative routing table for the API gateway.

Previously the gateway resolved each request's destination service with a
hand-written chain of `if p.startswith(...)` *prefix* checks in main.py.
Prefix matching means a specific route is, textually, a sub-path of a
broader one (`/api/suites/{id}/runs` starts with `/api/suites`), so it can
only be routed correctly if its check happens to run before the broader
one's — an invariant that has to be maintained by hand and isn't checked
anywhere. That's exactly the shape of bug that shipped once already: a
specific route added without being placed above its broader sibling
silently misrouted to the wrong service.

Routes are declared here as one list of (path template, service name)
pairs instead, matched by *exact* template shape (using the same `{name}`
placeholder syntax FastAPI's own route decorators use) rather than by
prefix — so `/api/suites/{suite_id}/runs` and `/api/suites/{suite_id}` are
two distinct patterns that can never swallow one another, regardless of
list order. That structurally removes this whole bug class rather than
just ordering around it.

What can still go stale is the table itself relative to the real services:
an endpoint added to a service without a matching entry here resolves to
no service (the gateway 404s it) instead of quietly reaching the wrong
one, and an entry left behind after a route is renamed or removed points
at nothing real. `tests/services/test_gateway.py` checks both directions
by importing each real service app and diffing its actual `/api/*` routes
against this table — so either kind of drift fails a test instead of
surfacing as a runtime 404 (or worse, a silent misroute) later.
"""
import re
from functools import lru_cache
from typing import Optional

# (path template, service name).
ROUTES: list[tuple[str, str]] = [
    ("/api/suites/{suite_id}/testcases/generate", "ai"),
    ("/api/suites/{suite_id}/testcases/generate/save", "projects"),
    ("/api/suites/{suite_id}/runs", "runs"),
    ("/api/auth/setup", "auth"),
    ("/api/auth/register", "auth"),
    ("/api/auth/login", "auth"),
    ("/api/auth/me", "auth"),
    ("/api/users", "auth"),
    ("/api/users/{user_id}", "auth"),
    ("/api/users/{user_id}/status", "auth"),
    ("/api/version", "auth"),
    ("/api/projects", "projects"),
    ("/api/projects/{project_id}", "projects"),
    ("/api/projects/{project_id}/suites", "projects"),
    ("/api/projects/{project_id}/stats", "projects"),
    ("/api/projects/{project_id}/analytics", "projects"),
    ("/api/suites/{suite_id}", "projects"),
    ("/api/suites/{suite_id}/testcases", "projects"),
    ("/api/testcases/{tc_id}", "projects"),
    ("/api/demo/alerts-microservice", "projects"),
    ("/api/demo/testflow", "projects"),
    ("/api/demo/playwright", "projects"),
    ("/api/runs/{run_id}", "runs"),
    ("/api/runs/{run_id}/results/{tc_id}", "runs"),
]

_PLACEHOLDER = re.compile(r"\{[^/{}]+\}")


@lru_cache(maxsize=None)
def _compile(template: str) -> re.Pattern:
    """Turn a FastAPI-style path template into a regex: literal segments are
    escaped as-is, `{name}` placeholders become a single non-slash segment
    matcher. A trailing slash is always optional."""
    parts = re.split(r"(\{[^/{}]+\})", template)
    pattern = "".join(
        "[^/]+" if _PLACEHOLDER.fullmatch(part) else re.escape(part)
        for part in parts
    )
    return re.compile(f"^{pattern}/?$")


def resolve_service(path: str) -> Optional[str]:
    """Return the service name that owns `path` (e.g. "/api/suites/1/runs"
    or "suites/1/runs"), or None if no route in the table matches."""
    normalized = "/" + path.lstrip("/")
    for template, service in ROUTES:
        if _compile(template).fullmatch(normalized):
            return service
    return None
