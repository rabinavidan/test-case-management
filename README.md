# TestFlow — Test Case Management

A full-stack test case management platform built with FastAPI microservices, Vanilla JS, PostgreSQL, and Redis.
Designed to demonstrate cutting-edge engineering practices — microservice decomposition, event-driven async, real-time WebSocket collaboration, and AI-powered test generation.

---

## Features

### Core workflow
- **Projects → Suites → Test Cases → Runs → Results** — complete test lifecycle management
- Paginated project listing with search (`?page=&page_size=&search=`)
- Priority levels (Critical / High / Medium / Low) and status labels (Active / Draft)
- Per-result run notes and pass / fail / skip marking

### Cutting-edge additions

| Feature | Tech | Endpoint / File |
|---------|------|----------------|
| **AI Test Generation** | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) | `POST /api/suites/{id}/testcases/generate` |
| **Real-time Collaboration** | WebSocket + Redis Pub/Sub | `WS /ws/runs/{run_id}` |
| **Analytics Dashboard** | Chart.js 4 (pass-rate trend line, suite coverage bars) | `GET /api/projects/{id}/analytics` |
| **Microservice Architecture** | 5 services · Docker Compose · Redis events | `services/` + `docker-compose.microservices.yml` |
| **Structured Logging** | JSON middleware logging every HTTP request with latency_ms | per service `main.py` |
| **Paginated API** | Envelope `{items, total, page, page_size, total_pages}` | `GET /api/projects` |

---

## Architecture

Two deployment modes are supported. The public URL surface (`/api/*`, `/ws/*`) is identical in both.

### Microservice mode *(recommended)*

```
Browser (Vanilla JS SPA)
  │  HTTP / REST + WebSocket
  ▼
┌─────────────────────────────────────────────────────────┐
│  Gateway  :8000  (httpx proxy · static file serving)    │
└──┬──────────┬──────────┬──────────────────────────┬─────┘
   │          │          │                          │
   ▼          ▼          ▼                          ▼
Auth:8001  Projects:8002  Runs:8003            AI:8004
JWT login  CRUD + stats  Runs + results        Claude Haiku
users      analytics     WebSocket             test generation
           demo seed     Redis pub/sub
               │              │
               └──────┬───────┘
                      ▼
               PostgreSQL 16
               ├─ schema: auth      (users)
               ├─ schema: projects  (projects, test_suites, test_cases)
               └─ schema: runs      (test_runs, test_results)

               Redis 7
               └─ channel: runs.completed  (async event pub/sub)
```

**Key design decisions:**
- JWT embeds `role` claim — non-auth services verify tokens locally (no auth round-trip per request)
- Synchronous HTTP (httpx) for tight coupling: runs ↔ projects for test case lookup
- Redis Pub/Sub for fire-and-forget `run.completed` events; degrades gracefully if Redis is down
- Gateway is a thin proxy — frontend requires zero changes vs. the monolith

### Monolith mode *(original · still works)*

```
Browser (SPA)
  │  HTTP / REST + WebSocket
  ▼
FastAPI (api/main.py) — single process
  ├─ JWT auth middleware
  ├─ ConnectionManager (WebSocket broadcast)
  ├─ /api/suites/{id}/testcases/generate  ──► Anthropic Claude Haiku API
  └─ SQLAlchemy ORM
       ├─ PostgreSQL (Neon · production)
       └─ SQLite (/tmp · local dev / Vercel)
```

---

## Quick start

### Microservice mode (Docker Compose + Postgres + Redis)

```bash
cp .env.example .env   # set JWT_SECRET_KEY and ANTHROPIC_API_KEY
docker compose -f docker-compose.microservices.yml up --build
# open http://localhost:8000
```

### Monolith mode (local dev — SQLite)

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
# open http://localhost:8000
```

### Monolith mode (Docker Compose + Postgres)

```bash
cp .env.example .env
docker compose up --build
# open http://localhost:8000
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | SQLite `/tmp/testflow.db` | Postgres URL for production |
| `JWT_SECRET_KEY` | `change-me-in-production` | HS256 signing secret |
| `ANTHROPIC_API_KEY` | *(empty)* | Required for AI test generation |
| `REDIS_URL` | `redis://localhost:6379` | Used by Runs service (microservice mode) |

---

## API reference (key endpoints)

All endpoints are identical regardless of deployment mode (monolith or microservices).

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/projects?page=1&page_size=50&search=
POST   /api/projects
DELETE /api/projects/{id}
GET    /api/projects/{id}/stats
GET    /api/projects/{id}/analytics

GET    /api/projects/{id}/suites
POST   /api/projects/{id}/suites

GET    /api/suites/{id}/testcases
POST   /api/suites/{id}/testcases
POST   /api/suites/{id}/testcases/generate      # AI generation (→ AI service)
POST   /api/suites/{id}/testcases/generate/save # Bulk save AI results

POST   /api/suites/{id}/runs
GET    /api/suites/{id}/runs
GET    /api/runs/{id}
PUT    /api/runs/{id}/results/{testcase_id}

WS     /ws/runs/{run_id}                        # Real-time result updates
```

---

## Testing

### pytest (API unit tests)

```bash
pip install pytest
pytest tests/ -v
```

### Playwright TypeScript E2E

```bash
cd e2e && npm install
npx playwright install chromium
npm test                                      # headless
BASE_URL=https://your-app.vercel.app npm test # against staging
```

See [`e2e/README.md`](e2e/README.md) for full details.

---

## Project structure

```
.
├── api/                          # Monolith (FastAPI single-process)
│   ├── main.py                   # All routes, WebSocket, AI generation, middleware
│   ├── models.py                 # SQLAlchemy ORM models
│   ├── schemas.py                # Pydantic v2 request/response schemas
│   └── database.py              # DB engine + session factory
│
├── services/                     # Microservice architecture
│   ├── gateway/                  # :8000 HTTP proxy + WebSocket bridge + SPA files
│   ├── auth/                     # :8001 JWT login · register · user management
│   ├── projects/                 # :8002 Projects · suites · test cases · analytics
│   ├── runs/                     # :8003 Test runs · results · WebSocket · Redis events
│   ├── ai/                       # :8004 Claude Haiku AI test case generation
│   └── README.md                 # Microservice architecture deep-dive
│
├── infra/
│   └── init.sql                  # Creates auth / projects / runs Postgres schemas
│
├── static/
│   ├── index.html                # SPA shell (Chart.js CDN included)
│   └── app.js                    # All UI logic — hash routing, WebSocket, Chart.js
│
├── tests/                        # pytest API tests
├── e2e/                          # Playwright TypeScript E2E tests
├── Dockerfile                    # Monolith container
├── docker-compose.yml            # Monolith mode (app + Postgres)
├── docker-compose.microservices.yml  # Microservice mode (5 services + Postgres + Redis)
├── requirements.txt
└── vercel.json                   # Vercel serverless deployment (monolith)
```

---

## Deployment

### Vercel (monolith)
The app deploys automatically to **Vercel** on every push to `main` via GitHub Actions.
Each pull request gets its own preview URL.
Set `DATABASE_URL` (Neon Postgres), `JWT_SECRET_KEY`, and `ANTHROPIC_API_KEY` in Vercel environment variables.

### Self-hosted (microservices)
Use `docker-compose.microservices.yml` with a Postgres 16 instance and Redis 7.
The gateway container is the only one that needs to be publicly exposed.
