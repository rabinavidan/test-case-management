"""
Agent Workflow Milestone 3 (issue #187) — AI test-coverage-gap agent.

Diffs a PR's changed api/ and services/ files against tests/: any changed
source file with no test file touched in the same layer (tests/unit,
tests/api, tests/contract, tests/services — mirrors CONTRIBUTING.md's "new
code needs new tests at the same layer it changes") is a likely coverage
gap. For each one, asks Gemini (not Anthropic — see deploy/gcp/README.md's
Milestone 3 discussion; this agent is a plain text-generation call, not
Claude Code, so a free-tier model is a genuine fit here) to draft concrete
test-case suggestions, then posts them as a single PR comment.

Requires a GEMINI_API_KEY repository secret (a free tier is available at
https://aistudio.google.com/apikey) to actually call the model — without
it this script exits early having posted nothing, same graceful-skip
pattern as claude-pr-steward.yml without ANTHROPIC_API_KEY.

Usage (from .github/workflows/coverage-gap-agent.yml):
    GEMINI_API_KEY=... GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
      python scripts/coverage_gap_agent.py <pr_number> <base_sha> <head_sha>
"""
import os
import subprocess
import sys

import httpx

SOURCE_PREFIXES = ("api/", "services/")
TEST_LAYER_PREFIXES = {
    "api/": ("tests/unit/", "tests/api/", "tests/contract/"),
    "services/": ("tests/unit/", "tests/services/", "tests/contract/"),
}
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
COMMENT_MARKER = "<!-- coverage-gap-agent -->"


def changed_files(base_sha: str, head_sha: str) -> list[str]:
    """Files changed between base_sha and head_sha, via a real `git diff`
    (relies on the workflow having checked out with enough history to
    resolve both refs — see fetch-depth: 0 in the workflow)."""
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base_sha}...{head_sha}"],
        capture_output=True, text=True, check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def find_likely_gaps(changed: list[str]) -> list[str]:
    """Changed api/ or services/ files with no test file touched in a
    matching layer, in the same changeset. Best-effort — a PR that adds
    tests separately in a later commit against the same file, or edits a
    test file without changing its name (e.g. an existing test extended
    to cover the new code) is still flagged if no test path changed at all;
    a false positive here just means a PR comment suggests tests that may
    already exist, not a build failure."""
    source_files = [f for f in changed if f.startswith(SOURCE_PREFIXES)]
    test_files = [f for f in changed if f.startswith("tests/")]

    gaps = []
    for source_file in source_files:
        prefix = next(p for p in SOURCE_PREFIXES if source_file.startswith(p))
        layers = TEST_LAYER_PREFIXES[prefix]
        if not any(t.startswith(layers) for t in test_files):
            gaps.append(source_file)
    return gaps


def build_gemini_prompt(file_path: str, diff_snippet: str) -> str:
    return (
        "You are a senior QA engineer reviewing a pull request. The file "
        f"`{file_path}` changed with no corresponding test file touched in "
        "the same pull request. Given this diff, suggest 2-4 concrete, "
        "specific test cases (not generic advice) that should cover the "
        "change. Keep each suggestion to one sentence. Reply with a "
        "markdown bullet list only, no preamble.\n\n"
        f"```diff\n{diff_snippet}\n```"
    )


def call_gemini(client: httpx.Client, api_key: str, prompt: str) -> str:
    response = client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": api_key},
        json={"contents": [{"parts": [{"text": prompt}]}]},
    )
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def build_pr_comment(suggestions: dict[str, str]) -> str:
    lines = [
        COMMENT_MARKER,
        "## 🧪 Possible test-coverage gaps",
        "",
        "These changed files had no test file touched in the same PR "
        "(`tests/unit`, `tests/api`, `tests/contract`, `tests/services` — "
        "see `.claude/skills/steward/SKILL.md`). Suggestions below are a "
        "starting point, not a mandate — some may already be covered by an "
        "existing test this heuristic can't see.",
        "",
    ]
    for file_path, suggestion in suggestions.items():
        lines += [f"### `{file_path}`", suggestion, ""]
    return "\n".join(lines)


def _api_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def find_existing_comment(client: httpx.Client, repo: str, pr_number: str, token: str) -> dict | None:
    response = client.get(
        f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments",
        headers=_api_headers(token),
    )
    response.raise_for_status()
    for comment in response.json():
        if COMMENT_MARKER in comment.get("body", ""):
            return comment
    return None


def post_or_update_comment(client: httpx.Client, repo: str, pr_number: str, token: str, body: str) -> str:
    headers = _api_headers(token)
    existing = find_existing_comment(client, repo, pr_number, token)
    if existing is not None:
        response = client.patch(
            f"https://api.github.com/repos/{repo}/issues/comments/{existing['id']}",
            json={"body": body},
            headers=headers,
        )
    else:
        response = client.post(
            f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments",
            json={"body": body},
            headers=headers,
        )
    response.raise_for_status()
    return response.json()["html_url"]


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: coverage_gap_agent.py <pr_number> <base_sha> <head_sha>")
    pr_number, base_sha, head_sha = sys.argv[1:4]

    gaps = find_likely_gaps(changed_files(base_sha, head_sha))
    if not gaps:
        print("No likely test-coverage gaps detected.")
        return

    print(f"Likely coverage gaps: {gaps}")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not set — skipping Gemini calls and PR comment (expected outside CI, or before the secret is configured).")
        return

    with httpx.Client(timeout=30) as client:
        suggestions = {}
        for file_path in gaps:
            diff = subprocess.run(
                ["git", "diff", f"{base_sha}...{head_sha}", "--", file_path],
                capture_output=True, text=True, check=True,
            ).stdout[:6000]  # keep prompts bounded regardless of how large a single file's diff is
            prompt = build_gemini_prompt(file_path, diff)
            suggestions[file_path] = call_gemini(client, api_key, prompt)

        body = build_pr_comment(suggestions)

        repo = os.environ.get("GITHUB_REPOSITORY")
        token = os.environ.get("GITHUB_TOKEN")
        if not repo or not token:
            print("GITHUB_REPOSITORY/GITHUB_TOKEN not set — printing suggestions instead of posting a comment.")
            print(body)
            return

        comment_url = post_or_update_comment(client, repo, pr_number, token, body)
    print(f"Posted coverage-gap comment: {comment_url}")


if __name__ == "__main__":
    main()
