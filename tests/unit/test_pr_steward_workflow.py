"""Unit test for Agent Workflow Milestone 1 (issue #185) — parses
.github/workflows/claude-pr-steward.yml with PyYAML and checks its
triggers/permissions/steps. No GitHub Actions run, no Anthropic API call.
"""
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).parent.parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/claude-pr-steward.yml"
SKILL_PATH = REPO_ROOT / ".claude/skills/steward/SKILL.md"


def _load_workflow():
    return yaml.safe_load(WORKFLOW_PATH.read_text())


def test_workflow_parses_as_valid_yaml():
    config = _load_workflow()
    assert config["name"] == "Claude PR Steward"


def test_workflow_triggers_on_pr_events_reviews_and_comments():
    config = _load_workflow()
    # PyYAML parses the bare `on:` key as the boolean True.
    triggers = config[True]
    assert "pull_request" in triggers
    assert set(triggers["pull_request"]["types"]) >= {"opened", "synchronize"}
    assert "pull_request_review" in triggers
    assert "issue_comment" in triggers


def test_steward_job_grants_only_the_permissions_it_needs():
    config = _load_workflow()
    permissions = config["jobs"]["steward"]["permissions"]
    assert permissions["contents"] == "write"
    assert permissions["pull-requests"] == "write"
    # No admin/org-wide scopes. id-token is what claude-code-action needs
    # for its OIDC token exchange — required for the action to run at all.
    assert permissions["id-token"] == "write"
    assert set(permissions) <= {"contents", "pull-requests", "issues", "checks", "actions", "id-token"}


def test_steward_job_skips_issue_comments_that_do_not_mention_claude():
    config = _load_workflow()
    condition = config["jobs"]["steward"]["if"]
    assert "@claude" in condition
    assert "issue_comment" in condition


def test_steward_job_uses_the_claude_code_action_with_the_api_key_secret():
    config = _load_workflow()
    steps = config["jobs"]["steward"]["steps"]
    claude_step = next(s for s in steps if "claude-code-action" in s.get("uses", ""))
    assert claude_step["with"]["anthropic_api_key"] == "${{ secrets.ANTHROPIC_API_KEY }}"


def test_steward_prompt_points_at_the_skill_file():
    config = _load_workflow()
    steps = config["jobs"]["steward"]["steps"]
    claude_step = next(s for s in steps if "claude-code-action" in s.get("uses", ""))
    assert ".claude/skills/steward/SKILL.md" in claude_step["with"]["prompt"]


def test_referenced_skill_file_exists():
    assert SKILL_PATH.exists()
    content = SKILL_PATH.read_text()
    # The workflow's job description promises these; keep them honest.
    assert "Required checks" in content
    assert "Known flake" in content
    assert "Merge convention" in content
