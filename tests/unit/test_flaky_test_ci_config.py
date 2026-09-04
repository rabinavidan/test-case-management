"""Unit test for Agent Workflow Milestone 2 (issue #186) — parses
.github/workflows/test.yml with PyYAML and checks the flaky-test triage
wiring: pytest-rerunfailures enabled, least-privilege permissions for
filing the tracking issue, and the report step pointing at the right
script. No GitHub Actions run.
"""
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/test.yml"


def _load_workflow():
    return yaml.safe_load(WORKFLOW_PATH.read_text())


def _api_tests_job():
    return _load_workflow()["jobs"]["api-tests"]


def test_pytest_step_reruns_failures_once():
    job = _api_tests_job()
    pytest_step = next(s for s in job["steps"] if s.get("id") == "pytest")
    assert "--reruns 1" in pytest_step["run"]


def test_api_tests_job_grants_only_the_permissions_it_needs():
    permissions = _api_tests_job()["permissions"]
    assert permissions["contents"] == "read"
    assert permissions["issues"] == "write"
    assert set(permissions) == {"contents", "issues"}


def test_flake_report_step_runs_the_flake_script():
    job = _api_tests_job()
    flake_step = next(s for s in job["steps"] if s.get("name") == "Report flaky tests")
    assert flake_step["run"] == "python scripts/flake_report.py report.json"
    assert flake_step["if"] == "always()"


def test_flake_report_step_only_passes_a_real_token_on_push_to_main():
    job = _api_tests_job()
    flake_step = next(s for s in job["steps"] if s.get("name") == "Report flaky tests")
    token_expr = flake_step["env"]["GITHUB_TOKEN"]
    assert "refs/heads/main" in token_expr
    assert "github.event_name == 'push'" in token_expr
    assert "secrets.GITHUB_TOKEN" in token_expr


def test_flake_report_script_exists():
    assert (REPO_ROOT / "scripts/flake_report.py").exists()
