"""Unit tests for scripts/failure_classifier.py — product bug vs test-code
bug vs infra classification of CI failures, from both pytest-json-report and
Playwright JSON report payloads. Report fixtures mirror the real shapes those
reporters emit (crash/longrepr per phase; nested suites/specs/tests/results).
"""
import json

import pytest

from scripts.failure_classifier import (
    INFRA,
    PRODUCT,
    TEST_CODE,
    UNKNOWN,
    classify,
    classify_report,
    main,
    render_markdown,
)


@pytest.mark.parametrize("message, phase, crash_path, expected", [
    ("AssertionError: assert {'status': 'fail'} == {'status': 'pass'}", "call", "tests/api/test_runs.py", PRODUCT),
    ("httpx.ConnectError: [Errno 111] Connection refused", "call", "/usr/lib/httpx/_transports/default.py", INFRA),
    ("NameError: name 'undefined_helper' is not defined", "call", "tests/api/test_x.py", TEST_CODE),
    ("KeyError: 'missing_fixture_value'", "setup", "tests/api/conftest.py", TEST_CODE),
    ("E       fixture 'nope' not found", "setup", "", TEST_CODE),
    ("ModuleNotFoundError: No module named 'foo'", "call", "", TEST_CODE),
    ("KeyError: 'suite_id'", "call", "api/main.py", PRODUCT),
    ("AttributeError: 'NoneType' object has no attribute 'id'", "call", "tests/unit/test_y.py", TEST_CODE),
    ("AssertionError: assert 503 == 200\n where 503 = <Response [503]>.status_code", "call", "tests/e2e/test_z.py", INFRA),
    ("AssertionError: assert 500 == 200\n where 500 = <Response [500]>.status_code", "call", "tests/e2e/test_z.py", PRODUCT),
    ("browserType.launch: Executable doesn't exist at /opt/pw-browsers/chrome", "call", "", INFRA),
    ("locator.click: Timeout 5000ms exceeded.", "call", "", TEST_CODE),
    ("Error: strict mode violation: getByText('Run') resolved to 2 elements", "call", "", TEST_CODE),
    ("Error: expect(locator).toHaveText(expected) failed\nExpected: \"3\"\nReceived: \"2\"", "call", "", PRODUCT),
    ("RuntimeError: something odd", "call", "", UNKNOWN),
])
def test_classify(message, phase, crash_path, expected):
    category, reason = classify(message, phase, crash_path)
    assert category == expected, reason


def test_stack_line_numbers_are_not_read_as_http_status():
    # "app.ts:503:7" in a trace must not look like a 503 Service Unavailable.
    category, _ = classify("Error: expect(received).toBe(expected)\n    at app.ts:503:7", "call", "")
    assert category == PRODUCT


def test_infra_wins_over_setup_phase():
    # An environment outage during fixture setup is still infra, not a broken test.
    category, _ = classify("httpx.ConnectError: [Errno 111] Connection refused", "setup", "tests/conftest.py")
    assert category == INFRA


PYTEST_REPORT = {
    "summary": {"passed": 1, "failed": 2, "error": 1},
    "tests": [
        {"nodeid": "tests/api/test_ok.py::test_ok", "outcome": "passed"},
        {"nodeid": "tests/api/test_flaky.py::test_flaky", "outcome": "rerun"},
        {"nodeid": "tests/api/test_a.py::test_assert", "outcome": "failed",
         "setup": {"outcome": "passed"},
         "call": {"outcome": "failed",
                  "crash": {"path": "/repo/tests/api/test_a.py", "lineno": 6,
                            "message": "AssertionError: assert 2 == 3"},
                  "longrepr": "..."}},
        {"nodeid": "tests/api/test_b.py::test_conn", "outcome": "failed",
         "setup": {"outcome": "passed"},
         "call": {"outcome": "failed",
                  "crash": {"path": "/site-packages/httpx/_transports/default.py", "lineno": 89,
                            "message": "httpx.ConnectError: [Errno 111] Connection refused"}}},
        {"nodeid": "tests/api/test_c.py::test_fixture", "outcome": "error",
         "setup": {"outcome": "failed", "crash": None,
                   "longrepr": "file /repo/tests/api/test_c.py, line 13\nE       fixture 'nope' not found"}},
    ],
}


def test_classify_pytest_report_skips_passed_and_rerun():
    verdicts = classify_report(PYTEST_REPORT)
    assert [(v.test, v.category) for v in verdicts] == [
        ("tests/api/test_a.py::test_assert", PRODUCT),
        ("tests/api/test_b.py::test_conn", INFRA),
        ("tests/api/test_c.py::test_fixture", TEST_CODE),
    ]
    assert verdicts[0].owner == "Developers"
    assert verdicts[2].evidence == "fixture 'nope' not found"


PLAYWRIGHT_REPORT = {
    "suites": [{
        "title": "kpi.spec.ts", "file": "kpi.spec.ts",
        "specs": [{"title": "passes", "tests": [{"status": "expected", "results": [{"status": "passed"}]}]}],
        "suites": [{
            "title": "Guest view",
            "specs": [
                {"title": "shows cards", "tests": [{"status": "unexpected", "results": [
                    {"status": "failed", "error": {
                        "message": "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m",
                        "stack": "Error: ...\n    at kpi.spec.ts:503:7"}}]}]},
                {"title": "loads", "tests": [{"status": "unexpected", "results": [
                    {"status": "failed", "error": {"message": "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:8000/"}}]}]},
                {"title": "retried", "tests": [{"status": "flaky", "results": [{"status": "failed"}, {"status": "passed"}]}]},
            ],
        }],
    }],
}


def test_classify_playwright_report_walks_nested_suites():
    verdicts = classify_report(PLAYWRIGHT_REPORT)
    assert [(v.test, v.category) for v in verdicts] == [
        ("kpi.spec.ts › shows cards", PRODUCT),
        ("kpi.spec.ts › loads", INFRA),
    ]
    assert "\u001b" not in verdicts[0].evidence


def test_render_markdown_groups_by_owner():
    md = render_markdown(classify_report(PYTEST_REPORT))
    assert "| `product` | 1 | Developers |" in md
    assert "| `infra` | 1 | DevOps / environment |" in md
    assert "| `test-code` | 1 | Automation / QA |" in md
    assert "`unknown`" not in md.split("| Test |")[0]


def test_render_markdown_with_no_failures():
    assert "No failing tests" in render_markdown([])


def test_cli_json_output(tmp_path, capsys):
    report = tmp_path / "report.json"
    report.write_text(json.dumps(PYTEST_REPORT))
    assert main([str(report), "--format", "json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert [v["category"] for v in out] == [PRODUCT, INFRA, TEST_CODE]


def test_cli_never_fails_the_build_on_a_missing_report(tmp_path, capsys):
    assert main([str(tmp_path / "missing.json")]) == 0
    assert "no usable report" in capsys.readouterr().err
