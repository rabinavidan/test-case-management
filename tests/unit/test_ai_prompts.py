"""Unit tests for api/ai_prompts.py — the prompt builder and response
parser shared by the live AI Test Generation endpoint and the eval harness."""
import json

import pytest

from api.ai_prompts import (
    build_testcase_generation_user_prompt,
    build_triage_user_prompt,
    format_triage_problem_line,
    parse_testcase_generation_response,
)


def test_build_testcase_generation_user_prompt():
    prompt = build_testcase_generation_user_prompt("Auth", "Login flow", 3)
    assert "Auth" in prompt
    assert "Login flow" in prompt
    assert "3 test cases" in prompt


def test_parse_testcase_generation_response_plain_json():
    raw = json.dumps({"test_cases": [{"title": "A"}]})
    assert parse_testcase_generation_response(raw) == [{"title": "A"}]


def test_parse_testcase_generation_response_strips_markdown_fences():
    raw = "```json\n" + json.dumps({"test_cases": [{"title": "A"}]}) + "\n```"
    assert parse_testcase_generation_response(raw) == [{"title": "A"}]


def test_parse_testcase_generation_response_strips_bare_fences():
    raw = "```\n" + json.dumps({"test_cases": []}) + "\n```"
    assert parse_testcase_generation_response(raw) == []


def test_parse_testcase_generation_response_missing_key():
    assert parse_testcase_generation_response(json.dumps({})) == []


def test_parse_testcase_generation_response_invalid_json_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_testcase_generation_response("not json")


def test_format_triage_problem_line_with_all_fields():
    line = format_triage_problem_line("Login fails", "fail", "1. Log in", "User is logged in", "timed out")
    assert line == (
        "- [FAIL] Login fails\n"
        "  Steps: 1. Log in\n"
        "  Expected result: User is logged in\n"
        "  Executor notes: timed out"
    )


def test_format_triage_problem_line_missing_optional_fields():
    line = format_triage_problem_line("Logout clears session", "skip", None, None, None)
    assert "Steps: not recorded" in line
    assert "Expected result: not recorded" in line
    assert "Executor notes: none" in line


def test_build_triage_user_prompt():
    prompt = build_triage_user_prompt("Nightly regression", ["- [FAIL] a", "- [SKIP] b"])
    assert prompt == "Run: Nightly regression\n\nFailed/skipped results:\n- [FAIL] a\n- [SKIP] b"
