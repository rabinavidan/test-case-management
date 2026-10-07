"""
Classify each failing CI test as a product bug, a test-code (automation)
bug, or an infra/environment problem, and name who owns the fix.

Reads either report format CI already produces:
  - pytest-json-report's report.json (.github/workflows/test.yml)
  - Playwright's merged JSON report (.github/workflows/pw-ts.yml)

Deterministic rules only, no LLM, in priority order (first match wins):
  1. infra     - network/DNS/connection errors, 502/503/504, rate limits,
                 a missing browser executable, out of disk/memory. Owner:
                 DevOps / environment. The one category a single rerun fits.
  2. test-code - the test itself is broken: NameError/ImportError/SyntaxError,
                 a missing fixture, a fixture that crashed during setup or
                 teardown, a Playwright locator that matches nothing or too
                 much, or a Python error raised from a test file rather than
                 product code. Owner: automation / QA.
  3. product   - the app behaved differently from what the test expects: a
                 failed assertion or expect(), an HTTP 500, or an exception
                 raised from product code (api/, services/, shared/, static/).
                 Owner: developers. Never "fixed" by editing the assertion.
  4. unknown   - none of the above; a human reads the log.

Never fails the build: it labels failures for the job summary, it doesn't
gate anything.

Usage:
    python scripts/failure_classifier.py report.json [--format markdown|json]
"""
import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass

PRODUCT, TEST_CODE, INFRA, UNKNOWN = "product", "test-code", "infra", "unknown"

OWNERS = {
    PRODUCT: "Developers",
    TEST_CODE: "Automation / QA",
    INFRA: "DevOps / environment",
    UNKNOWN: "Needs human triage",
}

NEXT_STEP = {
    PRODUCT: "Reproduce against the app and fix product code; don't touch the assertion.",
    TEST_CODE: "Fix the test, fixture, or locator; product code is not implicated.",
    INFRA: "Check the environment/service; one rerun is justified, a code change isn't.",
    UNKNOWN: "Read the full log and reproduce locally before deciding.",
}

# Case-sensitive on purpose: exception names and error codes have a fixed
# spelling. HTTP status codes need context so a stack line like "app.ts:503:7"
# isn't read as a 503.
INFRA_PATTERNS = [
    r"ConnectError", r"ConnectTimeout", r"ConnectionRefused", r"ConnectionResetError",
    r"Connection refused", r"Connection reset", r"Name or service not known",
    r"Temporary failure in name resolution", r"getaddrinfo", r"ECONNREFUSED", r"ECONNRESET",
    r"ETIMEDOUT", r"EAI_AGAIN", r"net::ERR_", r"ReadTimeout", r"PoolTimeout",
    r"50[234] (Bad Gateway|Service Unavailable|Gateway Timeout)", r"Response \[50[234]\]",
    r"status(_code)?\W{1,3}50[234]\b", r"429 Too Many Requests", r"Response \[429\]",
    r"[Rr]ate limit", r"Executable doesn't exist", r"browserType\.launch",
    r"No space left on device", r"ENOSPC", r"MemoryError", r"OOMKilled",
    r"database is locked", r"could not connect to server",
]

TEST_CODE_PATTERNS = [
    r"\bNameError\b", r"\bImportError\b", r"ModuleNotFoundError", r"\bSyntaxError\b",
    r"IndentationError", r"fixture '[^']+' not found", r"strict mode violation",
    r"locator\.\w+: Timeout", r"is not a function", r"ReferenceError", r"Cannot find module",
]

# Errors that mean "the test's own code is wrong" when raised from a test file,
# but "the product crashed" when raised from product code.
PROGRAMMING_ERRORS = r"\b(AttributeError|TypeError|KeyError|IndexError|ValueError)\b"

PRODUCT_PATTERNS = [
    r"\bAssertionError\b", r"expect\(received\)", r"expect\(locator\)",
    r"500 Internal Server Error", r"Response \[500\]", r"status(_code)?\W{1,3}500\b",
]

TEST_PATH = re.compile(r"(^|/)(tests|e2e|e2e-bdd|java-tests|java-e2e)/")
PRODUCT_PATH = re.compile(r"(^|/)(api|services|shared|static)/")


@dataclass
class Verdict:
    test: str
    category: str
    owner: str
    reason: str
    evidence: str


def _first_match(patterns: list[str], text: str) -> str | None:
    for p in patterns:
        if re.search(p, text):
            return p
    return None


def classify(message: str, phase: str = "call", crash_path: str = "") -> tuple[str, str]:
    """Returns (category, reason) for one failure. `phase` is pytest's
    setup/call/teardown; `crash_path` is the file the exception was raised in."""
    text = message or ""
    hit = _first_match(INFRA_PATTERNS, text)
    if hit:
        return INFRA, f"infra signature /{hit}/"
    hit = _first_match(TEST_CODE_PATTERNS, text)
    if hit:
        return TEST_CODE, f"test-code signature /{hit}/"
    if phase in ("setup", "teardown"):
        return TEST_CODE, f"failed during fixture {phase}, before/after the test body ran"
    if re.search(PROGRAMMING_ERRORS, text):
        if crash_path and PRODUCT_PATH.search(crash_path) and not TEST_PATH.search(crash_path):
            return PRODUCT, f"exception raised in product code ({crash_path})"
        if crash_path and TEST_PATH.search(crash_path):
            return TEST_CODE, f"programming error raised in a test file ({crash_path})"
    hit = _first_match(PRODUCT_PATTERNS, text)
    if hit:
        return PRODUCT, f"behavior differs from expectation /{hit}/"
    if crash_path and PRODUCT_PATH.search(crash_path) and not TEST_PATH.search(crash_path):
        return PRODUCT, f"exception raised in product code ({crash_path})"
    return UNKNOWN, "no known signature"


def _evidence(text: str) -> str:
    """The most telling line: the first that names an error, else the first
    non-empty one. pytest's longrepr prefixes error lines with "E   "."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", text or "")  # Playwright messages carry ANSI colors
    lines = [re.sub(r"^E\s+", "", ln.strip()) for ln in text.splitlines() if ln.strip()]
    telling = next((ln for ln in lines if re.search(r"Error|fixture '|expect\(|Timeout", ln)), None)
    return (telling or (lines[0] if lines else ""))[:200]


def _pytest_failures(report: dict):
    for t in report.get("tests", []):
        if t.get("outcome") not in ("failed", "error"):
            continue
        for phase in ("setup", "call", "teardown"):
            stage = t.get(phase) or {}
            if stage.get("outcome") != "failed":
                continue
            crash = stage.get("crash") or {}
            message = crash.get("message") or stage.get("longrepr") or ""
            yield t["nodeid"], message, phase, crash.get("path", "")
            break


def _playwright_failures(report: dict):
    def walk(suite, file_hint):
        file_hint = suite.get("file") or file_hint
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                if test.get("status") != "unexpected":
                    continue
                last = (test.get("results") or [{}])[-1]
                err = last.get("error") or {}
                # message only: the stack's "file.ts:503:7" line numbers would
                # trip the HTTP-status patterns.
                yield f"{file_hint} › {spec.get('title', '')}", err.get("message") or "", "call", ""
        for child in suite.get("suites", []):
            yield from walk(child, file_hint)

    for suite in report.get("suites", []):
        yield from walk(suite, "")


def classify_report(report: dict) -> list[Verdict]:
    failures = _playwright_failures(report) if "suites" in report else _pytest_failures(report)
    verdicts = []
    for test, message, phase, crash_path in failures:
        category, reason = classify(message, phase, crash_path)
        verdicts.append(Verdict(test, category, OWNERS[category], reason, _evidence(message)))
    return verdicts


def render_markdown(verdicts: list[Verdict]) -> str:
    if not verdicts:
        return "### 🧭 Failure triage\n\nNo failing tests to classify.\n"
    counts = {c: sum(v.category == c for v in verdicts) for c in OWNERS}
    lines = [
        "### 🧭 Failure triage — product bug vs test-code bug vs infra",
        "",
        "| Category | Count | Owner | Next step |",
        "|---|---|---|---|",
    ]
    for c in (PRODUCT, TEST_CODE, INFRA, UNKNOWN):
        if counts[c]:
            lines.append(f"| `{c}` | {counts[c]} | {OWNERS[c]} | {NEXT_STEP[c]} |")
    lines += ["", "| Test | Category | Why | Evidence |", "|---|---|---|---|"]
    for v in verdicts:
        evidence = v.evidence.replace("|", "\\|").replace("`", "'")
        lines.append(f"| `{v.test}` | `{v.category}` | {v.reason.replace('|', chr(92) + '|')} | `{evidence}` |")
    lines += ["", "_Deterministic rules in `scripts/failure_classifier.py`; `unknown` means read the log._", ""]
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("report")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args(argv)
    try:
        with open(args.report, encoding="utf-8") as f:
            report = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"failure_classifier: no usable report at {args.report} ({e})", file=sys.stderr)
        return 0
    verdicts = classify_report(report)
    if args.format == "json":
        print(json.dumps([asdict(v) for v in verdicts], indent=2))
    else:
        print(render_markdown(verdicts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
