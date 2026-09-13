"""Prompt templates for the AI Test Generation feature, extracted from
api/main.py's generate_testcases endpoint so the eval harness (evals/) can
run the exact same prompt against other models (e.g. a local Ollama model)
without importing FastAPI route code or drifting out of sync with what
production actually sends.
"""
import json

TESTCASE_GENERATION_SYSTEM_PROMPT = (
    "You are a senior QA engineer. Generate detailed, actionable test cases for the given feature. "
    "Each test case must be concise, unambiguous, and cover a distinct scenario. "
    "Respond with a JSON object matching exactly this schema:\n"
    '{"test_cases": [{"title": str, "description": str, "steps": str, '
    '"expected_result": str, "priority": "low"|"medium"|"high"|"critical"}]}'
)


def build_testcase_generation_user_prompt(suite_name: str, feature_description: str, count: int) -> str:
    return (
        f"Suite: {suite_name}\n"
        f"Feature description: {feature_description}\n"
        f"Generate exactly {count} test cases."
    )


def parse_testcase_generation_response(raw: str) -> list[dict]:
    """Strips markdown code fences if present and parses the JSON payload.
    Shared by the live API endpoint and the eval harness so both interpret
    a model's response identically."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    parsed = json.loads(raw)
    return parsed.get("test_cases", [])
