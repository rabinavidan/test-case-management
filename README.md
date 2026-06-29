# TestFlow — Test Case Management

A full-stack test case management platform built with FastAPI, Vanilla JS, and PostgreSQL.
Designed to demonstrate cutting-edge engineering practices in a compact, interview-ready codebase.

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
| **Real-time Collaboration** | WebSocket (`websockets>=12.0`, FastAPI `WebSocket`) | `WS /ws/runs/{run_id}` |
| **Analytics Dashboard** | Chart.js 4 (pass-rate trend line, suite coverage bars) | `GET /api/projects/{id}/analytics` |
| **Docker Compose** | Postgres 16-alpine + app container | `docker-compose.yml` |
| **Structured Logging** | JSON middleware logging every HTTP request with latency_ms | `api/main.py` |
| **Paginated API** | Envelope `{items, total, page, page_size, total_pages}` | `GET /api/projects` |

---

## Architecture

```
Browser (SPA)
  │  HTTP / REST + WebSocket
  ▼
FastAPI (api/main.py)
  ├─ JWT auth middleware
  ├─ Structured JSON logging middleware
  ├─ ConnectionManager (WebSocket broadcast)
  ├─ /api/suites/{id}/testcases/generate  ──► Anthropic Claude Haiku API
  └─ SQLAlchemy ORM
       ├─ PostgreSQL (Neon · production)
       └─ SQLite (/tmp · local dev / Vercel)

CI/CD
  ├─ GitHub Actions (pytest + Playwright E2E)
  └─ Vercel (serverless, preview per PR)
```

---

## Quick start

### Local (SQLite)

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
# open http://localhost:8000
```

### Docker Compose (Postgres)

```bash
cp .env.example .env          # set JWT_SECRET_KEY and optionally ANTHROPIC_API_KEY
docker compose up --build
# open http://localhost:8000
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | SQLite `/tmp/testflow.db` | Postgres URL for production |
| `JWT_SECRET_KEY` | `change-me-in-production` | HS256 signing secret |
| `ANTHROPIC_API_KEY` | *(empty)* | Required for AI test generation |

---

## API reference (key endpoints)

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
POST   /api/suites/{id}/testcases/generate      # AI generation
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
├── api/
│   ├── main.py          # FastAPI app, routes, WebSocket, AI generation, middleware
│   ├── models.py        # SQLAlchemy ORM models
│   ├── schemas.py       # Pydantic v2 request/response schemas
│   └── database.py      # DB engine + session factory
├── static/
│   ├── index.html       # SPA shell (Chart.js CDN included)
│   └── app.js           # All UI logic — hash routing, WebSocket client, Chart.js
├── tests/               # pytest API tests
├── e2e/                 # Playwright TypeScript E2E tests
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── vercel.json
```

---

## Deployment

The app deploys automatically to **Vercel** on every push to `main` via GitHub Actions.
Each pull request gets its own preview URL.
Set `DATABASE_URL` (Neon Postgres) and `JWT_SECRET_KEY` in Vercel environment variables.
`ANTHROPIC_API_KEY` is required to enable AI test generation in production.
