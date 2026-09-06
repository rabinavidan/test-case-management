"""Unit test for Agent Workflow Milestone 4 (issue #188) — parses
.github/workflows/dependabot-auto-merge.yml with PyYAML and checks the
triage logic: patch/minor bumps auto-approved and auto-merged, major bumps
flagged for human review, the job scoped to dependabot PRs only. No
GitHub Actions run.
"""
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/dependabot-auto-merge.yml"


def _load_workflow():
    return yaml.safe_load(WORKFLOW_PATH.read_text())


def _triage_job():
    return _load_workflow()["jobs"]["triage"]


def test_workflow_triggers_on_pull_requests_to_main():
    config = _load_workflow()
    triggers = config[True]
    assert triggers["pull_request"]["branches"] == ["main"]


def test_job_only_runs_for_dependabot_prs():
    job = _triage_job()
    assert job["if"] == "github.actor == 'dependabot[bot]'"


def test_permissions_are_least_privilege():
    permissions = _load_workflow()["permissions"]
    assert permissions == {"contents": "write", "pull-requests": "write"}


def test_uses_dependabot_fetch_metadata_action():
    job = _triage_job()
    metadata_step = next(s for s in job["steps"] if "dependabot/fetch-metadata" in s.get("uses", ""))
    assert metadata_step["id"] == "metadata"


def test_auto_merge_step_only_fires_for_patch_or_minor_updates():
    job = _triage_job()
    step = next(s for s in job["steps"] if s.get("name", "").startswith("Auto-approve"))
    condition = step["if"]
    assert "semver-patch" in condition
    assert "semver-minor" in condition
    assert "semver-major" not in condition
    assert "gh pr review" in step["run"]
    assert "--approve" in step["run"]
    assert "gh pr merge" in step["run"]
    assert "--auto" in step["run"]


def test_major_bump_step_only_fires_for_major_updates_and_never_merges():
    job = _triage_job()
    step = next(s for s in job["steps"] if s.get("name", "").startswith("Comment on major"))
    assert step["if"] == "steps.metadata.outputs.update-type == 'version-update:semver-major'"
    assert "gh pr merge" not in step["run"]
    assert "gh pr comment" in step["run"]
