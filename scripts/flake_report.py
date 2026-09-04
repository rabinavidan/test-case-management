"""
Agent Workflow Milestone 2 (issue #186) — flaky-test detection.

Parses pytest-json-report's report.json (produced by
.github/workflows/test.yml's pytest step, now run with
--reruns 1 --reruns-delay 2 via pytest-rerunfailures) for any test whose
outcome is "rerun" — pytest-json-report's label for a test that failed on
its first attempt but passed on a rerun. That's the flake signal: it
distinguishes "needed a retry to pass" from a real failure, which still
reports as "failed" and still fails the build (reruns don't mask that).

On push to main, files or updates a single tracking GitHub issue listing
currently-flaky tests, so a recurring flake accumulates evidence across CI
runs instead of vanishing the moment its rerun goes green.

Usage (from .github/workflows/test.yml, after the pytest step):
    GITHUB_REPOSITORY=... GITHUB_TOKEN=... GITHUB_RUN_URL=... \
      python scripts/flake_report.py report.json
"""
import json
import os
import sys

import httpx

FLAKE_ISSUE_TITLE = "CI: flaky tests detected"
FLAKE_ISSUE_LABEL = "flaky-test"


def find_flaky_tests(report: dict) -> list[str]:
    """Node IDs of every test whose outcome was "rerun" — pytest-json-report's
    label for a test that failed at least once but passed on a later attempt."""
    return sorted(t["nodeid"] for t in report.get("tests", []) if t.get("outcome") == "rerun")


def build_flake_issue_body(flaky_tests: list[str], run_url: str) -> str:
    lines = [
        "Automatically detected by the flaky-test triage step in "
        "`.github/workflows/test.yml` — these tests failed on their first "
        "attempt but passed on a `pytest-rerunfailures` retry.",
        "",
        f"**Latest occurrence:** {run_url}" if run_url else "**Latest occurrence:** (no run URL provided)",
        "",
        "**Currently flaky:**",
    ]
    lines += [f"- `{nodeid}`" for nodeid in flaky_tests]
    lines += [
        "",
        "A rerun passing doesn't mean it's safe to ignore — investigate and "
        "fix the root cause; see `.claude/skills/steward/SKILL.md` for the "
        "known `tests/contract` flake and how it's been triaged so far.",
    ]
    return "\n".join(lines)


def _api_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def find_existing_issue(client: httpx.Client, repo: str, token: str) -> dict | None:
    query = f'repo:{repo} type:issue state:open label:"{FLAKE_ISSUE_LABEL}" in:title "{FLAKE_ISSUE_TITLE}"'
    response = client.get(
        "https://api.github.com/search/issues",
        params={"q": query},
        headers=_api_headers(token),
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    return items[0] if items else None


def file_or_update_flake_issue(client: httpx.Client, repo: str, token: str, flaky_tests: list[str], run_url: str) -> str:
    """Create the tracking issue if none is open, else comment on it with
    this run's occurrence. Returns the issue's html_url."""
    body = build_flake_issue_body(flaky_tests, run_url)
    headers = _api_headers(token)

    existing = find_existing_issue(client, repo, token)
    if existing is None:
        response = client.post(
            f"https://api.github.com/repos/{repo}/issues",
            json={"title": FLAKE_ISSUE_TITLE, "body": body, "labels": [FLAKE_ISSUE_LABEL]},
            headers=headers,
        )
        response.raise_for_status()
        return response.json()["html_url"]

    response = client.post(
        f"https://api.github.com/repos/{repo}/issues/{existing['number']}/comments",
        json={"body": body},
        headers=headers,
    )
    response.raise_for_status()
    return existing["html_url"]


def main():
    report_path = sys.argv[1] if len(sys.argv) > 1 else "report.json"
    with open(report_path) as f:
        report = json.load(f)

    flaky_tests = find_flaky_tests(report)
    if not flaky_tests:
        print("No flaky tests detected.")
        return

    print(f"Flaky tests detected: {flaky_tests}")

    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    run_url = os.environ.get("GITHUB_RUN_URL", "")
    if not repo or not token:
        print("GITHUB_REPOSITORY/GITHUB_TOKEN not set — skipping issue filing (expected outside CI).")
        return

    with httpx.Client(timeout=10) as client:
        issue_url = file_or_update_flake_issue(client, repo, token, flaky_tests, run_url)
    print(f"Flake tracking issue: {issue_url}")


if __name__ == "__main__":
    main()
