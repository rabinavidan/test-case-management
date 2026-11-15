"""Unit tests for agents/test_plan_reviewer.py — LangChain's own
FakeListChatModel stands in for a real Ollama model, so none of this
requires a real Ollama server. langchain_core.exceptions.OutputParserException
firing on malformed model output is exercised directly, since a real
0.5B model was observed doing exactly that while building this (see
agents/README.md).
"""
import json

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from agents.test_plan_reviewer import (
    PlanReviewError,
    build_ollama_chat_model,
    draft_test_cases_for_gaps,
    find_coverage_gaps,
    review_and_fill_gaps,
)

VALID_TEST_CASE = {
    "title": "Login with invalid credentials",
    "description": "Verify login fails",
    "steps": "1. Enter bad password\n2. Submit",
    "expected_result": "Error shown",
    "priority": "medium",
}


def _fake_llm(*responses):
    return FakeListChatModel(responses=list(responses))


# --- find_coverage_gaps ------------------------------------------------------

def test_find_coverage_gaps_returns_gaps_list():
    llm = _fake_llm(json.dumps({"gaps": ["Login with invalid credentials", "Account lockout"]}))
    gaps = find_coverage_gaps("Login", [{"title": "Login with valid credentials"}], llm)
    assert gaps == ["Login with invalid credentials", "Account lockout"]


def test_find_coverage_gaps_handles_no_existing_cases():
    llm = _fake_llm(json.dumps({"gaps": ["Login with valid credentials"]}))
    gaps = find_coverage_gaps("Login", [], llm)
    assert gaps == ["Login with valid credentials"]


def test_find_coverage_gaps_returns_empty_when_response_not_a_dict():
    llm = _fake_llm(json.dumps(["not", "a", "dict"]))
    assert find_coverage_gaps("Login", [], llm) == []


def test_find_coverage_gaps_raises_on_unparseable_response():
    # A real 0.5B model was observed returning plain prose instead of JSON
    # despite the "respond ONLY with JSON" instruction.
    llm = _fake_llm("Sure, here are some gaps you might want to test.")
    with pytest.raises(Exception):  # noqa: B017 - langchain_core.exceptions.OutputParserException
        find_coverage_gaps("Login", [], llm)


# --- draft_test_cases_for_gaps -----------------------------------------------

def test_draft_test_cases_for_gaps_returns_test_cases():
    llm = _fake_llm(json.dumps({"test_cases": [VALID_TEST_CASE]}))
    result = draft_test_cases_for_gaps("Login", ["Login with invalid credentials"], llm)
    assert result == [VALID_TEST_CASE]


def test_draft_test_cases_for_gaps_short_circuits_on_no_gaps():
    # A response the fake model would fail to parse — proves the LLM is
    # never even called when there are no gaps to draft for.
    llm = _fake_llm("not json at all")
    assert draft_test_cases_for_gaps("Login", [], llm) == []


def test_draft_test_cases_for_gaps_raises_on_unparseable_response():
    llm = _fake_llm("not json at all")
    with pytest.raises(Exception):  # noqa: B017
        draft_test_cases_for_gaps("Login", ["some gap"], llm)


# --- review_and_fill_gaps (the full pipeline) --------------------------------

def test_review_and_fill_gaps_full_pipeline():
    llm = _fake_llm(
        json.dumps({"gaps": ["Login with invalid credentials"]}),
        json.dumps({"test_cases": [VALID_TEST_CASE]}),
    )
    result = review_and_fill_gaps("Login", [{"title": "Login with valid credentials"}], llm=llm)
    assert result == {"gaps": ["Login with invalid credentials"], "new_test_cases": [VALID_TEST_CASE]}


def test_review_and_fill_gaps_no_gaps_skips_drafting():
    llm = _fake_llm(json.dumps({"gaps": []}))
    result = review_and_fill_gaps("Login", [{"title": "Login with valid credentials"}], llm=llm)
    assert result == {"gaps": [], "new_test_cases": []}


def test_review_and_fill_gaps_wraps_critic_failure():
    llm = _fake_llm("not json")
    with pytest.raises(PlanReviewError, match="Coverage-gap review failed"):
        review_and_fill_gaps("Login", [], llm=llm)


def test_review_and_fill_gaps_wraps_drafter_failure():
    llm = _fake_llm(json.dumps({"gaps": ["Login with invalid credentials"]}), "not json")
    with pytest.raises(PlanReviewError, match="Drafting test cases for gaps failed"):
        review_and_fill_gaps("Login", [], llm=llm)


# --- build_ollama_chat_model --------------------------------------------------

def test_build_ollama_chat_model_defaults():
    llm = build_ollama_chat_model()
    assert llm.model == "qwen2.5:0.5b"
    assert llm.temperature == 0.2


def test_build_ollama_chat_model_custom_model_and_host():
    llm = build_ollama_chat_model(model="llama3.1", host="http://example:11434")
    assert llm.model == "llama3.1"
    assert llm.base_url == "http://example:11434"


def test_review_and_fill_gaps_builds_default_client_when_none_given(monkeypatch):
    import agents.test_plan_reviewer as module

    llm = _fake_llm(json.dumps({"gaps": []}))
    monkeypatch.setattr(module, "build_ollama_chat_model", lambda model, host: llm)

    result = review_and_fill_gaps("Login", [])
    assert result == {"gaps": [], "new_test_cases": []}
