"""Test Plan Reviewer — a small two-step agentic pipeline built with
LangChain instead of the hand-rolled HTTP-client style this repo's other
agents use (scripts/coverage_gap_agent.py, evals/ollama_client.py):

  1. **critic**  — given a feature description and its existing test cases,
     list concrete scenarios they don't cover.
  2. **drafter** — given those gaps, draft one test case per gap, in the
     same schema AI Test Generation uses (api/ai_prompts.py), so the
     output can be saved through the existing
     POST /api/suites/{id}/testcases/generate/save endpoint unchanged.

Each step is a LangChain Expression Language chain (`prompt | llm | parser`)
with its own role and prompt — a minimal but genuine multi-step agent, not
a single LLM call relabeled. Backed by a local Ollama model via
langchain-ollama's ChatOllama: no API key, no per-call cost, consistent
with evals/'s Ollama-first approach.

A local 0.5B model occasionally fails to follow the "respond with only
JSON" instruction (observed directly while building this — see
docs/ for the case study) — both langchain_core.exceptions.OutputParserException
and a plain unreachable-server error are caught and re-raised as
PlanReviewError, the same "degrade with a clear error instead of
crashing" contract this repo's other AI integrations follow.
"""
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate

DEFAULT_MODEL = "qwen2.5:0.5b"
# Lower than evals/'s default 0.7: structured-output tasks (respond with
# only a JSON object matching this schema) are noticeably more reliable at
# lower temperature — confirmed by hand against a real local model while
# building this, not a guess.
DEFAULT_TEMPERATURE = 0.2

# Note the doubled {{ }} below: these strings are fed to
# ChatPromptTemplate, which treats single braces as template variables —
# doubling escapes the literal JSON schema in the instructions.
CRITIC_SYSTEM_PROMPT = (
    "You are a senior QA engineer reviewing a set of test cases for coverage gaps. "
    "Given a feature description and its existing test cases, list concrete scenarios "
    "the existing test cases do NOT cover. Do not repeat scenarios that are already "
    "covered. Respond ONLY with a JSON object, no other text, matching exactly this "
    'schema: {{"gaps": ["scenario 1", "scenario 2"]}}'
)

DRAFTER_SYSTEM_PROMPT = (
    "You are a senior QA engineer. Given a feature description and a list of coverage "
    "gaps found by a reviewer, draft one concise, actionable test case per gap. "
    "Respond ONLY with a JSON object, no other text, matching exactly this schema:\n"
    '{{"test_cases": [{{"title": str, "description": str, "steps": str, '
    '"expected_result": str, "priority": "low"|"medium"|"high"|"critical"}}]}}'
)


class PlanReviewError(RuntimeError):
    """A pipeline step failed to produce parseable output, or the
    underlying model call itself failed (e.g. Ollama unreachable)."""


def build_ollama_chat_model(model: str = DEFAULT_MODEL, host: Optional[str] = None) -> BaseChatModel:
    from langchain_ollama import ChatOllama

    kwargs = {"model": model, "temperature": DEFAULT_TEMPERATURE}
    if host:
        kwargs["base_url"] = host
    return ChatOllama(**kwargs)


def _format_existing_test_cases(test_cases: list[dict]) -> str:
    if not test_cases:
        return "(none yet)"
    return "\n".join(f"- {tc.get('title', '(untitled)')}: {tc.get('description', '')}" for tc in test_cases)


def find_coverage_gaps(feature_description: str, existing_test_cases: list[dict], llm: BaseChatModel) -> list[str]:
    """The critic step: what scenarios are missing? Raises on a model/parse
    failure — callers that want the "degrade gracefully" contract should go
    through review_and_fill_gaps instead of calling this directly."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", CRITIC_SYSTEM_PROMPT),
        ("human", "Feature: {feature_description}\n\nExisting test cases:\n{existing}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    result = chain.invoke({
        "feature_description": feature_description,
        "existing": _format_existing_test_cases(existing_test_cases),
    })
    return result.get("gaps", []) if isinstance(result, dict) else []


def draft_test_cases_for_gaps(feature_description: str, gaps: list[str], llm: BaseChatModel) -> list[dict]:
    """The drafter step: write a test case for each gap the critic found."""
    if not gaps:
        return []
    prompt = ChatPromptTemplate.from_messages([
        ("system", DRAFTER_SYSTEM_PROMPT),
        ("human", "Feature: {feature_description}\n\nCoverage gaps:\n{gaps}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    result = chain.invoke({
        "feature_description": feature_description,
        "gaps": "\n".join(f"- {g}" for g in gaps),
    })
    return result.get("test_cases", []) if isinstance(result, dict) else []


def review_and_fill_gaps(
    feature_description: str,
    existing_test_cases: list[dict],
    llm: Optional[BaseChatModel] = None,
    model: str = DEFAULT_MODEL,
    host: Optional[str] = None,
) -> dict:
    """Runs the critic -> drafter pipeline end to end. Pass `llm` (any
    LangChain BaseChatModel, e.g. a FakeListChatModel in tests) to bypass
    the default Ollama backend."""
    llm = llm or build_ollama_chat_model(model, host)

    try:
        gaps = find_coverage_gaps(feature_description, existing_test_cases, llm)
    except Exception as exc:
        raise PlanReviewError(f"Coverage-gap review failed: {exc}") from exc

    if not gaps:
        return {"gaps": [], "new_test_cases": []}

    try:
        new_test_cases = draft_test_cases_for_gaps(feature_description, gaps, llm)
    except Exception as exc:
        raise PlanReviewError(f"Drafting test cases for gaps failed: {exc}") from exc

    return {"gaps": gaps, "new_test_cases": new_test_cases}
