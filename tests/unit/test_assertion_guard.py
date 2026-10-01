"""Unit tests for scripts/assertion_guard.py - catches a heal that changed
what a Playwright spec verifies, not just how it finds the element."""
import subprocess

import pytest

from scripts import assertion_guard as guard

BEFORE = """
test('checkout total', async ({ page }) => {
  await page.locator('#pay-btn').click();
  await expect(page.locator('#total')).toHaveText('$42.00');
  await expect(page.locator('#status')).toBeVisible();
  await page.goto('http://localhost:8000/#done'); // not a comment start inside the string
});
"""


def _levels(findings):
    return [(f.level, f.message.split(" ")[0]) for f in findings]


def test_selector_only_heal_passes():
    after = BEFORE.replace("#pay-btn", "[data-testid=pay]").replace("'#total'", "'[data-testid=total]'")
    assert guard.compare("e2e/tests/a.spec.ts", BEFORE, after) == []


def test_deleted_assertion_blocks():
    after = BEFORE.replace("  await expect(page.locator('#status')).toBeVisible();\n", "")
    findings = guard.compare("e2e/tests/a.spec.ts", BEFORE, after)
    assert [f.level for f in findings] == ["BLOCK"]
    assert "expect() calls dropped 2 -> 1" in findings[0].message


def test_commented_out_assertion_counts_as_removed():
    after = BEFORE.replace("  await expect(page.locator('#status'))", "  // await expect(page.locator('#status'))")
    assert any("dropped" in f.message for f in guard.compare("e2e/tests/a.spec.ts", BEFORE, after))


def test_skip_and_fixme_block():
    after = BEFORE.replace("test('checkout total'", "test.fixme('checkout total'")
    findings = guard.compare("e2e/tests/a.spec.ts", BEFORE, after)
    assert [f.level for f in findings] == ["BLOCK"]
    assert "skip/fixme" in findings[0].message


def test_loosened_matcher_blocks():
    after = BEFORE.replace(".toHaveText('$42.00')", ".toBeTruthy()")
    findings = guard.compare("e2e/tests/a.spec.ts", BEFORE, after)
    assert any(f.level == "BLOCK" and "loose matchers" in f.message for f in findings)


def test_negated_matcher_blocks():
    after = BEFORE.replace(").toBeVisible()", ").not.toBeVisible()")
    findings = guard.compare("e2e/tests/a.spec.ts", BEFORE, after)
    assert any(f.level == "BLOCK" and "negated" in f.message for f in findings)


def test_changed_expected_value_warns_for_a_human():
    after = BEFORE.replace("'$42.00'", "'$0.00'")
    findings = guard.compare("e2e/tests/a.spec.ts", BEFORE, after)
    assert [f.level for f in findings] == ["WARN"]
    assert "'$42.00'" in findings[0].message and "'$0.00'" in findings[0].message


def test_in_file_approval_marker_downgrades_to_warn():
    after = ("// assertion-change-approved: status banner removed in #300\n"
             + BEFORE.replace("  await expect(page.locator('#status')).toBeVisible();\n", ""))
    assert [f.level for f in guard.compare("e2e/tests/a.spec.ts", BEFORE, after)] == ["WARN"]


def test_label_approval_downgrades_and_deleted_file_blocks():
    assert [f.level for f in guard.compare("e2e/tests/a.spec.ts", BEFORE, None)] == ["BLOCK"]
    assert [f.level for f in guard.compare("e2e/tests/a.spec.ts", BEFORE, None, approved=True)] == ["WARN"]
    assert guard.compare("e2e/tests/new.spec.ts", None, BEFORE) == []


def test_assertion_profile_counts_soft_and_poll_and_ignores_block_comments():
    src = "expect.soft(a).toBe(1); expect.poll(f).toBe(2); /* expect(x).toBe(3) */ test.skip(true);"
    p = guard.assertion_profile(src)
    assert (p["expects"], p["skips"]) == (2, 1)


@pytest.fixture()
def repo(tmp_path, monkeypatch):
    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)
    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "t")
    (tmp_path / "e2e" / "tests").mkdir(parents=True)
    (tmp_path / "e2e" / "tests" / "a.spec.ts").write_text(BEFORE)
    (tmp_path / "README.md").write_text("x")
    git("add", ".")
    git("commit", "-q", "-m", "base")
    git("checkout", "-q", "-b", "heal")
    monkeypatch.chdir(tmp_path)
    return tmp_path, git


def test_main_blocks_a_weakening_commit(repo, capsys):
    path, git = repo
    (path / "e2e" / "tests" / "a.spec.ts").write_text(BEFORE.replace(".toHaveText('$42.00')", ".toBeDefined()"))
    (path / "README.md").write_text("y")
    git("commit", "-q", "-am", "heal")
    assert guard.main(["--base", "main"]) == 1
    out = capsys.readouterr().out
    assert "1 changed spec file(s)" in out and "BLOCK" in out
    assert guard.main(["--base", "main", "--approved"]) == 0


def test_main_passes_a_selector_heal(repo):
    path, git = repo
    (path / "e2e" / "tests" / "a.spec.ts").write_text(BEFORE.replace("#pay-btn", "[data-testid=pay]"))
    git("commit", "-q", "-am", "heal")
    assert guard.main(["--base", "main"]) == 0


def test_workflow_runs_guard_on_spec_changes_and_honours_label():
    import yaml
    from pathlib import Path
    wf = yaml.safe_load((Path(__file__).resolve().parents[2] / ".github/workflows/assertion-guard.yml").read_text())
    trigger = wf[True]["pull_request"]  # PyYAML reads the bare `on:` key as True
    assert "e2e/**/*.spec.ts" in trigger["paths"]
    assert {"labeled", "unlabeled"} <= set(trigger["types"])
    steps = wf["jobs"]["assertion-guard"]["steps"]
    assert steps[0]["with"]["fetch-depth"] == 0
    run = steps[-1]
    assert "assertion-change-approved" in run["env"]["APPROVED"]
    assert "scripts/assertion_guard.py" in run["run"] and "--approved" in run["run"]
