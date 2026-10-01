"""
Assertion guard - "a heal fixed the selector but changed what the test
verifies" (docs/ai-roadmap.md, "Reliability gaps").

The playwright-test-healer agent is told never to delete or loosen an
assertion to make a test pass (.claude/agents/playwright-test-healer.md),
and scripts/heal_metrics.py measures whether it *says* it complied. This
script checks what it actually *did*: it compares every changed Playwright
spec (e2e/**/*.spec.ts) between the PR base and head, assertion by
assertion, so a weakened test cannot merge looking like a selector fix.

Per file, comments stripped first (so commenting an expect() out counts as
removing it):

  BLOCK  fewer expect() calls than before                  (assertion removed)
  BLOCK  more test.skip / test.fixme / .skip( / .fixme(    (test disabled)
  BLOCK  more loose matchers (toBeTruthy, toBeDefined, ...) (assertion weakened)
  BLOCK  more negated matchers (.not.toX)                   (assertion inverted)
  BLOCK  a spec file deleted outright
  WARN   same matchers, different expected values           (a human should read it)

A BLOCK becomes a WARN when a human approved it: either the PR carries the
`assertion-change-approved` label (the workflow passes --approved), or the
file itself has a `// assertion-change-approved: <reason>` comment, so the
reason is reviewed in the diff. Selector-only changes - the healer's job -
touch none of the above and pass silently.

Usage:
    python scripts/assertion_guard.py --base origin/main [--head HEAD] [--approved]
Exits 1 if any unapproved BLOCK finding remains.
"""
import argparse
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass

SPEC_GLOB = re.compile(r"^e2e/.*\.spec\.ts$")
APPROVAL_MARKER = re.compile(r"//\s*assertion-change-approved:\s*\S")
LOOSE_MATCHERS = ("toBeTruthy", "toBeDefined", "toBeAttached", "toBeGreaterThanOrEqual",
                  "toBeInstanceOf", "toBeFalsy", "toBeNull", "toBeUndefined")

_EXPECT = re.compile(r"\bexpect(?:\.soft|\.poll)?\s*\(")
_SKIP = re.compile(r"\.(?:skip|fixme)\s*\(")
_MATCHER_CALL = re.compile(r"(\.not)?\.(to[A-Z]\w*)\s*\(")


def strip_comments(source: str) -> str:
    """Drops // and /* */ comments, leaving string literals alone (a URL's
    // inside quotes is not a comment)."""
    out, i, n = [], 0, len(source)
    quote = None
    while i < n:
        c = source[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
            out.append(c)
        elif source.startswith("//", i):
            j = source.find("\n", i)
            i = n if j == -1 else j
            continue
        elif source.startswith("/*", i):
            j = source.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        else:
            out.append(c)
        i += 1
    return "".join(out)


def _call_args(code: str, open_paren: int) -> str:
    depth, i = 0, open_paren
    while i < len(code):
        if code[i] in "([{":
            depth += 1
        elif code[i] in ")]}":
            depth -= 1
            if depth == 0:
                return " ".join(code[open_paren + 1:i].split())
        i += 1
    return code[open_paren + 1:].strip()


def assertion_profile(source: str) -> dict:
    code = strip_comments(source)
    matchers = []
    for m in _MATCHER_CALL.finditer(code):
        matchers.append((bool(m.group(1)), m.group(2), _call_args(code, m.end() - 1)))
    return {
        "expects": len(_EXPECT.findall(code)),
        "skips": len(_SKIP.findall(code)),
        "loose": sum(1 for _, name, _ in matchers if name in LOOSE_MATCHERS),
        "negated": sum(1 for neg, _, _ in matchers if neg),
        "matchers": matchers,
    }


@dataclass
class Finding:
    path: str
    level: str  # "BLOCK" or "WARN"
    message: str


def compare(path: str, before: str | None, after: str | None, approved: bool = False) -> list[Finding]:
    """Findings for one spec file; before/after is None when the file was
    added/deleted."""
    if before is None:
        return []
    file_approved = approved or bool(after and APPROVAL_MARKER.search(after))
    block = "WARN" if file_approved else "BLOCK"
    if after is None:
        return [Finding(path, block, "spec file deleted - every assertion in it is gone")]

    old, new = assertion_profile(before), assertion_profile(after)
    findings = []
    if new["expects"] < old["expects"]:
        findings.append(Finding(path, block, f"expect() calls dropped {old['expects']} -> {new['expects']}"))
    if new["skips"] > old["skips"]:
        findings.append(Finding(path, block, f"skip/fixme markers rose {old['skips']} -> {new['skips']}"))
    if new["loose"] > old["loose"]:
        findings.append(Finding(path, block, f"loose matchers ({', '.join(LOOSE_MATCHERS[:3])}, ...) "
                                             f"rose {old['loose']} -> {new['loose']}"))
    if new["negated"] > old["negated"]:
        findings.append(Finding(path, block, f"negated .not matchers rose {old['negated']} -> {new['negated']}"))

    old_names = Counter((neg, name) for neg, name, _ in old["matchers"])
    new_names = Counter((neg, name) for neg, name, _ in new["matchers"])
    if old_names == new_names:
        changed = Counter(old["matchers"]) - Counter(new["matchers"])
        for neg, name, args in sorted(changed):
            replacement = [a for n2, nm, a in new["matchers"] if (n2, nm) == (neg, name)
                           and (n2, nm, a) not in old["matchers"]]
            findings.append(Finding(path, "WARN", f"{'.not' if neg else ''}.{name}({args}) now "
                                                  f"expects ({replacement[0] if replacement else '?'}) - "
                                                  "confirm the expected value change is intended"))
    return findings


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def _show(ref: str, path: str) -> str | None:
    result = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else None


def changed_specs(base: str, head: str) -> tuple[list[str], str]:
    merge_base = _git("merge-base", base, head).strip()
    names = _git("diff", "--name-only", "--no-renames", merge_base, head).splitlines()
    return [n for n in names if SPEC_GLOB.match(n)], merge_base


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True, help="Base ref, e.g. origin/main.")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--approved", action="store_true",
                        help="A human approved assertion changes (PR label); BLOCK findings become WARN.")
    args = parser.parse_args(argv)

    paths, merge_base = changed_specs(args.base, args.head)
    findings = []
    for path in paths:
        findings += compare(path, _show(merge_base, path), _show(args.head, path), approved=args.approved)

    print(f"assertion guard: {len(paths)} changed spec file(s)")
    for f in findings:
        print(f"  {f.level:<5} {f.path}: {f.message}")
    blocking = [f for f in findings if f.level == "BLOCK"]
    if blocking:
        print("\nAn assertion was removed, disabled or weakened. If that is intended, add a "
              "'// assertion-change-approved: <reason>' comment to the spec or have a reviewer "
              "apply the 'assertion-change-approved' label.")
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
