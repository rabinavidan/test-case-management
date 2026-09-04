"""Unit test for Agent Workflow Milestone 3 (issue #187) — parses
.github/workflows/coverage-gap-agent.yml with PyYAML and checks its
triggers, permissions, and that it invokes the coverage-gap script with
the PR's base/head SHAs. No GitHub Actions run, no Gemini API call.
"""
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/coverage-gap-agent.yml"


def _load_workflow():
    return yaml.safe_load(WORKFLOW_PATH.read_text())


def test_workflow_parses_and_triggers_on_pr_events():
    config = _load_workflow()
    triggers = config[True]  # PyYAML parses bare `on:` as the key True
    assert set(triggers["pull_request"]["types"]) >= {"opened", "synchronize"}


def test_job_grants_only_the_permissions_it_needs():
    job = _load_workflow()["jobs"]["coverage-gap"]
    permissions = job["permissions"]
    assert permissions == {"contents": "read", "pull-requests": "write"}


def test_checkout_step_fetches_full_history_for_git_diff():
    job = _load_workflow()["jobs"]["coverage-gap"]
    checkout_step = next(s for s in job["steps"] if s.get("uses", "").startswith("actions/checkout"))
    assert checkout_step["with"]["fetch-depth"] == 0


def test_final_step_invokes_the_script_with_pr_number_and_both_shas():
    job = _load_workflow()["jobs"]["coverage-gap"]
    run_step = job["steps"][-1]
    assert "scripts/coverage_gap_agent.py" in run_step["run"]
    assert "github.event.pull_request.number" in run_step["run"]
    assert "github.event.pull_request.base.sha" in run_step["run"]
    assert "github.event.pull_request.head.sha" in run_step["run"]
    assert run_step["env"]["GEMINI_API_KEY"] == "${{ secrets.GEMINI_API_KEY }}"


def test_referenced_script_exists():
    assert (REPO_ROOT / "scripts/coverage_gap_agent.py").exists()
