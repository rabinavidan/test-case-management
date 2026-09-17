"""Unit tests for evals/llm_judge.py — pure prompt-building and response
parsing, no Ollama server involved."""
import json

import pytest

from evals.llm_judge import (
    build_judge_prompt_for_test_generation,
    build_judge_prompt_for_triage,
    parse_judge_score,
)


def test_build_judge_prompt_for_test_generation_includes_feature_and_raw_response():
    case = {"feature_description": "Login flow with lockout"}
    system_prompt, user_prompt = build_judge_prompt_for_test_generation(case, '{"test_cases": []}')

    assert "0.0" in system_prompt and "1.0" in system_prompt
    assert "score" in system_prompt
    assert "Login flow with lockout" in user_prompt
    assert '{"test_cases": []}' in user_prompt


def test_build_judge_prompt_for_triage_includes_run_name_and_raw_response():
    case = {"run_name": "Nightly regression"}
    system_prompt, user_prompt = build_judge_prompt_for_triage(case, "A timeout in the auth service.")

    assert "root cause" in system_prompt
    assert "Nightly regression" in user_prompt
    assert "A timeout in the auth service." in user_prompt


def test_build_judge_prompt_for_triage_defaults_run_name_when_missing():
    _, user_prompt = build_judge_prompt_for_triage({}, "summary")
    assert "Run: Run" in user_prompt


def test_parse_judge_score_reads_the_score_field():
    assert parse_judge_score(json.dumps({"score": 0.75, "reasoning": "solid"})) == 0.75


def test_parse_judge_score_clamps_above_one():
    assert parse_judge_score(json.dumps({"score": 1.4})) == 1.0


def test_parse_judge_score_clamps_below_zero():
    assert parse_judge_score(json.dumps({"score": -0.3})) == 0.0


def test_parse_judge_score_coerces_a_string_score():
    assert parse_judge_score(json.dumps({"score": "0.6"})) == 0.6


def test_parse_judge_score_strips_markdown_code_fences():
    raw = "```json\n" + json.dumps({"score": 0.8}) + "\n```"
    assert parse_judge_score(raw) == 0.8


def test_parse_judge_score_raises_on_invalid_json():
    with pytest.raises(json.JSONDecodeError):
        parse_judge_score("not json at all")


def test_parse_judge_score_raises_when_score_field_missing():
    with pytest.raises(KeyError):
        parse_judge_score(json.dumps({"reasoning": "no score given"}))
