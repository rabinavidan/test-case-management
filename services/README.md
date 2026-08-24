# TestFlow — Microservice Architecture

## Services

| Service | Port | Responsibility |
|---------|------|----------------|
| **gateway** | 8000 | HTTP/WS proxy, serves SPA static files |
| **auth** | 8001 | Register, login, JWT, user management |
| **projects** | 8002 | Projects, test suites, test cases, analytics, demo seed |
| **runs** | 8003 | Test runs, results recording, WebSocket live collab |
| **ai** | 8004 | AI test case generation via Claude Haiku |

## Infrastructure

| Component | Purpose |
|-----------|---------|
| **PostgreSQL 16** | Shared DB — separate schemas: `auth`, `projects`, `runs` |
| **Redis 7** | Pub/Sub for async events (`runs.completed`) |

## Running

```bash
# Copy and configure env
cp .env.example .env  # set JWT_SECRET_KEY, ANTHROPIC_API_KEY, etc.

# Start all services
docker compose -f docker-compose.microservices.yml up --build
```

The SPA is available at http://localhost:8000 (same URL as the monolith).

## Architecture Diagram

```
Browser
  │
  ▼
┌─────────────────────────────┐
│  Gateway  :8000             │  ← serves static SPA, proxies API + WebSocket
└─────┬──────┬──────┬─────────┘
      │      │      │
  /api/auth /api/  /api/runs
  /api/users projects/ /ws/runs
      │      │      │
  ┌───▼─┐ ┌──▼──┐ ┌─▼──┐  ┌──────┐
  │Auth │ │Proj │ │Runs│  │  AI  │
  │:8001│ │:8002│ │:8003│  │:8004 │
  └──┬──┘ └──┬──┘ └──┬─┘  └──────┘
     │       │       │
     └───────┴───────┘
             │
        ┌────▼────┐      ┌───────┐
        │Postgres │      │ Redis │
        │auth     │      │pub/sub│
        │projects │      └───────┘
        │runs     │
        └─────────┘
```

## Inter-service Communication

- **Sync (HTTP):** Gateway → services; runs ↔ projects for test case lookup
- **Async (Redis Pub/Sub):** runs service publishes `runs.completed` events on channel `runs.completed`

## JWT Strategy

Auth service embeds `role` in the JWT payload. Other services verify the token
locally using the shared `JWT_SECRET_KEY` — no round-trip to auth service needed
per request. The encode/decode implementation itself lives in one place —
[`common/jwt.py`](common/jwt.py) — imported by every service, including auth
(which layers a DB-backed `get_current_user` on top; see
[`common/auth.py`](common/auth.py) for the stateless version projects/runs/ai use).

## Shared library (`services/common/`)

Code that used to be copy-pasted into every service now lives here once:

| Module | What it replaced |
|--------|-------------------|
| `common/jwt.py` | The HMAC-SHA256 token encode/decode — previously duplicated in `services/auth/auth.py`, a since-deleted `services/_shared_auth.py`, and each of projects/runs/ai's own `auth.py`. One of those five copies had a base64-padding operator-precedence bug that crashed every authenticated request across the whole deployment — found by `tests/services/`, fixed everywhere, and now impossible to re-duplicate. |
| `common/auth.py` | The stateless `UserClaims` / `get_current_user` / `require_admin` verifier projects, runs, and ai all need — each service's own `auth.py` is now a two-line re-export so `from .auth import ...` in `main.py` didn't have to change. |
| `common/db.py` | The `DATABASE_URL` → engine → `SessionLocal` → `get_db()` boilerplate every `database.py` wired by hand. `Base` stays local to each service (its models attach to their own metadata). |
| `common/health.py` | The `{"status": "ok", "service": ...}` response shape every `/health` route returned inline. |

## Testing

Each service is covered in isolation by [`../tests/services/`](../tests/services)
(pytest + `TestClient`) — auth flows, CRUD, inter-service HTTP calls (mocked for the
happy path, genuinely unreachable for the graceful-degradation cases), and the
gateway's routing table. Run with `pytest tests/services -v` from the repo root.
See [`../README.md#test-architecture`](../README.md#test-architecture) for how this
fits into the rest of the test suite.
