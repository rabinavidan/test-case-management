"""Unit tests for api/ai_prompts.py — the prompt builder and response
parser shared by the live AI Test Generation endpoint and the eval harness."""
import json

import pytest

from api.ai_prompts import build_testcase_generation_user_prompt, parse_testcase_generation_response


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
