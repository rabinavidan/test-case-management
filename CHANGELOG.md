# Changelog

All notable changes to this project are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

`VERSION` is bumped automatically by CI (`.github/workflows/bump-version.yml`)
on every merge to `main`, so a version number doesn't always correspond to a
user-visible change — this file tracks the changes worth knowing about, not
every patch bump. History before this file existed is visible in `git log`
but isn't retroactively cataloged here.

## [Unreleased]

## [2.0.80] - 2026-08-29

Portfolio hardening pass — CI quality gate, test coverage reporting, and a
real security fix, done as four sequential PRs (#130-#132 and this one):

### Added
- `ruff` lint step in CI (`.github/workflows/test.yml`), enforced as a
  required check.
- Test coverage reporting via `pytest-cov` (`.coveragerc`), with an 85%
  floor enforced in CI and the coverage summary shown in the job summary.
- `validate_jwt_secret()` guard (`api/auth.py`, `services/common/jwt.py`) —
  refuses to start in production with an unset/placeholder `JWT_SECRET_KEY`.
- Rate limiting (5/minute per IP) on `/api/auth/login` and
  `/api/auth/register` via `slowapi`, in both the monolith and the
  microservices auth service.
- `.github/dependabot.yml`, `SECURITY.md`, `.github/CODEOWNERS`,
  `CONTRIBUTING.md`, this changelog.

### Fixed
- Several dead imports and a naming collision with `fastapi.status`
  surfaced by the new lint gate (`api/main.py`, `services/*/main.py`).
- A test that created a user via the API without asserting the response
  succeeded before relying on that user existing in a later step
  (`tests/services/test_auth_service.py`).

## Earlier

TestFlow's core feature set (projects/suites/test cases/runs, AI test
generation and failure triage, real-time WebSocket collaboration, the
microservices decomposition, four parity test stacks, the Contact Us flow,
the Log Center, Vercel Analytics, and everything else) was built up over
`main`'s history before this file was introduced — see `git log` for the
full record.
