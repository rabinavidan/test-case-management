"""
API Gateway — routes incoming HTTP and WebSocket requests to the appropriate
downstream microservice and serves the static SPA files.

Routing table:
  /api/auth/*                                 → AUTH_URL
  /api/users/*                                → AUTH_URL
  /api/version                                → AUTH_URL
  /api/suites/*/testcases/generate            → AI_URL   (must precede /api/suites/*)
  /api/suites/*/testcases/generate/save       → PROJECTS_URL
  /api/projects/*                             → PROJECTS_URL
  /api/suites/*                               → PROJECTS_URL
  /api/testcases/*                            → PROJECTS_URL
  /api/demo/*                                 → PROJECTS_URL
  /api/runs/*                                 → RUNS_URL
  /ws/runs/*                                  → RUNS_URL (WebSocket bridge)
"""
import os, asyncio, logging
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import httpx
import websockets

AUTH_URL     = os.getenv("AUTH_URL",     "http://auth:8001")
PROJECTS_URL = os.getenv("PROJECTS_URL", "http://projects:8002")
RUNS_URL     = os.getenv("RUNS_URL",     "http://runs:8003")
AI_URL       = os.getenv("AI_URL",       "http://ai:8004")

logger = logging.getLogger("gateway")

app = FastAPI(title="API Gateway", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

_http = httpx.AsyncClient(timeout=30)


def _upstream(path: str) -> str:
    """Determine which service URL to use based on request path."""
    p = path.lstrip("/")

    # Auth / user management
    if p.startswith("api/auth/") or p.startswith("api/users") or p == "api/version":
        return AUTH_URL

    # AI generation (must match before generic /api/suites/)
    if "/testcases/generate" in p and not p.endswith("/generate/save"):
        return AI_URL

    # Projects, suites, testcases, demo, analytics, stats
    if (p.startswith("api/projects") or p.startswith("api/suites")
            or p.startswith("api/testcases") or p.startswith("api/demo")):
        return PROJECTS_URL

    # Runs and results
    if p.startswith("api/runs"):
        return RUNS_URL

    return AUTH_URL  # fallback (version, health, debug)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    full_path = f"/api/{path}"
    base = _upstream(full_path)
    url = f"{base}{full_path}"
    if request.query_params:
        url = f"{url}?{request.query_params}"

    body = await request.body()
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "content-length")}

    try:
        upstream_resp = await _http.request(
            method=request.method,
            url=url,
            content=body,
            headers=headers,
        )
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            headers=dict(upstream_resp.headers),
            media_type=upstream_resp.headers.get("content-type"),
        )
    except httpx.ConnectError:
        return JSONResponse({"detail": f"Service unavailable: {base}"}, status_code=503)
    except Exception as e:
        logger.error(f"Gateway error {request.method} {full_path}: {e}")
        return JSONResponse({"detail": "Gateway error"}, status_code=502)


# ─── WebSocket bridge ─────────────────────────────────────────────────────────

@app.websocket("/ws/runs/{run_id}")
async def ws_bridge(run_id: int, client_ws: WebSocket):
    await client_ws.accept()
    runs_ws_url = RUNS_URL.replace("http://", "ws://").replace("https://", "wss://")
    upstream_url = f"{runs_ws_url}/ws/runs/{run_id}"
    try:
        async with websockets.connect(upstream_url) as upstream_ws:
            async def client_to_upstream():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        await upstream_ws.send(data)
                except (WebSocketDisconnect, Exception):
                    pass

            async def upstream_to_client():
                try:
                    async for msg in upstream_ws:
                        await client_ws.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception as e:
        logger.warning(f"WS bridge error run={run_id}: {e}")
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass


# ─── Static SPA ───────────────────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def root():
        return FileResponse(os.path.join(static_dir, "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        return FileResponse(os.path.join(static_dir, "index.html"))
