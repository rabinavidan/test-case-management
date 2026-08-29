# Security Policy

TestFlow is a portfolio/demonstration project (see [LICENSE](LICENSE)), not a
production service handling real user data. That said, it's built and
maintained with real security practices, and reports are welcome.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for a security finding.

Instead, use one of:

- **GitHub Private Vulnerability Reporting** — open the
  [Security tab](../../security/advisories/new) on this repository and
  submit a private advisory. This is the preferred channel.
- **Email** — rabin.avidan.dev@gmail.com, with a description of the issue,
  steps to reproduce, and its potential impact.

You should expect an acknowledgment within a few days. This is a
single-maintainer project, so response times outside that aren't guaranteed,
but every report will be read and triaged.

## Scope

In scope:

- The application code in `api/`, `services/`, `shared/`, and `static/`.
- CI/CD configuration in `.github/workflows/`.

Out of scope:

- The public demo deployment's data (seeded/synthetic — nothing sensitive is
  ever stored there; please don't spend time on it).
- Third-party dependencies — report those upstream, though a linked issue
  here is also welcome so it can be tracked.
- Findings that require an already-compromised deployment secret
  (`JWT_SECRET_KEY`, `SEED_ADMIN_PASSWORD`, etc.) to exploit — the app
  already assumes those are kept confidential.

## Current security posture

A non-exhaustive list of what's already in place, for context on what a
report might be duplicating:

- JWT secret enforcement — the app refuses to start in production
  (`VERCEL_ENV=production`) with an unset or placeholder `JWT_SECRET_KEY`
  (`api/auth.py`, `services/common/jwt.py`).
- Rate limiting on `/api/auth/login` and `/api/auth/register`
  (5 requests/minute per IP) against brute-force/credential-stuffing.
- Passwords hashed with `passlib` (never stored or logged in plaintext).
- CI runs `ruff` (lint) and the full test suite (`pytest`, Playwright,
  REST Assured) on every pull request, with a coverage floor.

Known accepted limitations (not vulnerabilities, but worth stating rather
than leaving implicit):

- The rate limiter's storage is in-memory and per-process — fine for this
  project's single-instance deployment, but wouldn't hold a limit across
  multiple instances without a shared backend (e.g. Redis).
- CORS is wide open (`allow_origins=["*"]`) — an intentional tradeoff for a
  publicly demoable API with no cookie-based session to protect.
