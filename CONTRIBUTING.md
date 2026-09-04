# Contributing

TestFlow is a single-maintainer portfolio project under a proprietary
license (see [LICENSE](LICENSE)) — it isn't set up to accept unsolicited
external pull requests. This doc exists anyway, for two reasons: it's the
reference for anyone the maintainer *does* invite to collaborate, and it
doubles as documentation of the engineering workflow the project actually
follows (useful context if you're reviewing this repo rather than
committing to it).

If you've found a bug or have a suggestion, open an issue — that's welcome
regardless. For a security issue, see [SECURITY.md](SECURITY.md) instead of
a public issue.

## Local setup

See the [Quick start](README.md#quick-start) section of the README for the
three ways to run the app (monolith/SQLite, monolith/Docker+Postgres,
microservices/Docker Compose). For working on tests or backend code without
Docker, the monolith/SQLite path is fastest:

```bash
pip install -r requirements.txt -r requirements-test.txt
uvicorn api.main:app --reload
```

## Before opening a PR

This repo runs four independent test stacks and a lint/coverage gate in CI
(`.github/workflows/`) — all of it is runnable locally first:

```bash
# Lint — must be clean, this is a required CI check
ruff check .

# Python test suite (unit + API + contract + services), with coverage
python -m pytest tests/unit tests/api tests/contract tests/services -v \
  --cov --cov-report=term-missing --cov-fail-under=85

# Playwright TypeScript E2E (needs the app running separately — see e2e/README.md)
cd e2e && npm test

# Java suites (needs the app running separately — see java-tests/README.md, java-e2e/README.md)
cd java-tests && mvn test
cd java-e2e && mvn test
```

A PR that fails any of these in CI won't merge — `ruff`, the coverage
floor, and the four test suites are all required checks. Coverage below
85% on `api/`, `services/`, or `shared/` fails the build the same way a
failing test does (see `.coveragerc`).

## Conventions

- **Commit messages**: describe *why*, not just *what* — the existing
  `git log` is the style reference. Squash noisy WIP history before
  opening a PR.
- **No unrelated changes in one PR**: a bug fix doesn't also reformat
  unrelated files or refactor something adjacent. Keep diffs reviewable.
- **New code needs new tests** at the same layer it changes — a new
  endpoint gets an `tests/api/` test, a new service behavior gets a
  `tests/services/` test, a new UI flow gets Playwright coverage in at
  least one of the parity stacks (`e2e/` or `tests/e2e/`).
- **Don't add a dependency for something the standard library or an
  existing dependency already covers.**
- Draft PRs are the default while CI is still running; mark ready for
  review once every check is green.

## Claude PR Steward

`.github/workflows/claude-pr-steward.yml` runs Claude Code against every
PR (on open/update, on a review, or when someone comments `@claude`) to
drive it toward green automatically — its repo-specific conventions live
in `.claude/skills/steward/SKILL.md`. It needs an `ANTHROPIC_API_KEY`
repository secret (Settings -> Secrets and variables -> Actions) to run;
without one, its job fails at the "Run Claude Code" step and every other
required check is unaffected.

## AI Test-Coverage-Gap Agent

`.github/workflows/coverage-gap-agent.yml` (`scripts/coverage_gap_agent.py`)
diffs every PR's changed `api/`/`services/` files against `tests/`; a
changed source file with no matching-layer test file touched in the same
PR gets Gemini-drafted test-case suggestions as a PR comment. Deliberately
Gemini, not Anthropic — this is a plain text-generation call (not Claude
Code), so a free-tier model is a fair fit; needs a `GEMINI_API_KEY`
repository secret (free tier: https://aistudio.google.com/apikey) to
actually call the model — without one it still detects and logs gaps, but
posts nothing.
