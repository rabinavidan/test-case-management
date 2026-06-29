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
per request.
