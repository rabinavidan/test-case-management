import logging
import mimetypes
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from shared.spa import is_page_path

from . import ai_review

# Importing bootstrap creates/migrates the tables and seeds the admin user and
# environments, exactly as this module used to do inline at import time.
from .bootstrap import _ENVIRONMENT_SEED, _seed_environments  # noqa: F401  (re-exported for tests)
from .rate_limit import limiter
from .realtime import ws_manager  # noqa: F401  (re-exported: tests and WebSocket broadcast)
from .request_log import bind_app as bind_request_log
from .request_log import log_requests
from .routers import (
    ai_generation,
    auth,
    contact,
    demo,
    environments,
    logs,
    projects,
    runs,
    suites,
    system,
    testcases,
    users,
)
from .settings import VERSION

# ─── Structured logging setup ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)

logger = logging.getLogger("testflow")


app = FastAPI(
    title="TestFlow API",
    version=VERSION,
    description="AI-powered test case management with real-time collaboration",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# static/app.js is ~300 KB of plain text on the homepage's critical path;
# gzip cuts it to roughly a fifth. Small JSON responses stay uncompressed.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)



@app.exception_handler(OverflowError)
async def overflow_error_handler(request: Request, exc: OverflowError):
    """`int` path params (project_id, suite_id, ...) have no upper bound at
    the FastAPI/Pydantic layer, so an out-of-SQLite-INTEGER-range value
    (e.g. > 2**63-1) reaches the DB layer and raises here instead of a clean
    404/422 — surfaced by the contract test suite (tests/backend/contract/), which
    fuzzes path params with extreme integers.
    """
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"loc": ["path"], "msg": "Invalid ID: out of range", "type": "value_error"}
            ]
        },
    )


# Request/response logging (api/request_log.py). Registered last, so it stays
# the outermost middleware, as when it was declared inline here.
bind_request_log(app)
app.middleware("http")(log_requests)


# ─── Routes: one router per resource (api/routers/) ─────────────────────────
for _router_module in (system, auth, environments, contact, logs, users,
                       projects, suites, testcases, runs, ai_generation, demo):
    app.include_router(_router_module.router)



# ─── Human review of AI drafts (M9) ──────────────────────────────────────────
# Before the SPA catch-all below; see api/ai_review.py.
app.include_router(ai_review.router)



# ─── GraphQL ──────────────────────────────────────────────────────────────────
# Mounted before the SPA catch-all below, which would otherwise swallow
# GET /graphql (the GraphiQL IDE). See api/gql/ for the schema.
from .gql import graphql_router  # noqa: E402

app.include_router(graphql_router, prefix="/graphql")



# ─── Static files (must be last) ─────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

VERCEL_ANALYTICS_TAGS = (
    '<script defer src="/_vercel/speed-insights/script.js"></script>\n'
    '  <script defer src="/_vercel/insights/script.js"></script>'
)


# StaticFiles takes types from the OS registry, which on many Windows machines
# lacks these, serving them as text/plain - fine only until a nosniff header
# makes the browser refuse them. Register the ones static/ uses explicitly.
for _type, _ext in (("text/javascript", ".js"), ("text/css", ".css"), ("image/svg+xml", ".svg"), ("image/webp", ".webp")):
    mimetypes.add_type(_type, _ext)


if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    def _serve_index() -> HTMLResponse:
        """`FileResponse` derives its ETag/Last-Modified from filesystem stat
        info, not file content — on Vercel's build, index.html's mtime is
        frozen to a fixed date across every deployment, so a browser that
        already cached this page gets a false "304 Not Modified" on every
        later deploy and is stuck on stale markup (e.g. missing a new
        `<div id="view-...">` a newer app.js expects) until a hard refresh.
        `HTMLResponse` skips that conditional-request machinery entirely, so
        every request gets the real current file.
        """
        with open(os.path.join(static_dir, "index.html"), "r", encoding="utf-8") as f:
            content = f.read()
        # Vercel serves its analytics scripts itself; anywhere else (local, CI,
        # Docker) the tags could only 404, so they're added on Vercel only.
        if os.getenv("VERCEL"):
            content = content.replace("<!-- vercel-analytics -->", VERCEL_ANALYTICS_TAGS)
        return HTMLResponse(content=content, headers={"Cache-Control": "no-cache"})

    @app.get("/", include_in_schema=False)
    def serve_root():
        return _serve_index()

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # A missing API route, file or platform path is a real 404, not the
        # SPA's index.html with a 200 (see shared/spa.py).
        if not is_page_path(full_path):
            if full_path.startswith("api"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            return HTMLResponse(status_code=404, content="Not Found")
        return _serve_index()
