"""Prompt templates for the AI Test Generation and AI Failure Triage
features, extracted from api/main.py's generate_testcases and triage_run
endpoints so the eval harness (evals/) can run the exact same prompts
against other models (e.g. a local Ollama model) without importing FastAPI
route code or drifting out of sync with what production actually sends.
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


# ─── Retrieval-grounded variant (course milestone M5) ─────────────────────────
# See api/retrieval.py: when generation runs "grounded", the nearest existing
# test cases in the suite (by embedding similarity) are retrieved and passed
# here as context, so the model can avoid re-covering scenarios that already
# exist and match the suite's established title/style conventions. The plain
# prompt above is kept unchanged as the no-retrieval fallback (used when the
# suite has no existing cases yet, or the caller doesn't opt in).

TESTCASE_GENERATION_GROUNDED_SYSTEM_PROMPT = (
    "You are a senior QA engineer. Generate detailed, actionable test cases for the given feature. "
    "Each test case must be concise, unambiguous, and cover a distinct scenario. "
    "You will also be shown existing test cases already in this suite - do NOT repeat a scenario one "
    "of them already covers (a title or scenario that's effectively the same, even if reworded); "
    "generate only new, distinct scenarios, and match the existing cases' naming and structure style. "
    "Respond with a JSON object matching exactly this schema:\n"
    '{"test_cases": [{"title": str, "description": str, "steps": str, '
    '"expected_result": str, "priority": "low"|"medium"|"high"|"critical"}]}'
)


def build_grounded_testcase_generation_user_prompt(
    suite_name: str, feature_description: str, count: int, similar_cases: list[dict],
) -> str:
    existing_block = "\n".join(
        f"- {case.get('title', '')}: {case.get('description', '') or '(no description)'}"
        for case in similar_cases
    ) if similar_cases else "(none yet)"
    return (
        f"Suite: {suite_name}\n"
        f"Feature description: {feature_description}\n"
        f"Existing test cases already in this suite (do not duplicate these):\n{existing_block}\n"
        f"Generate exactly {count} NEW test cases not already covered above."
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


TRIAGE_SYSTEM_PROMPT = (
    "You are a senior QA engineer triaging a failed test run. Given the failed/skipped "
    "test cases below — each with its steps, expected result, and any notes the executor "
    "left — write a concise plain-English summary (3-5 sentences) of the likely root "
    "cause(s) tying these failures together, and suggest what to check first. Synthesize "
    "a diagnosis; do not just repeat the list back."
)


def format_triage_problem_line(
    title: str,
    status: str,
    steps: str | None,
    expected_result: str | None,
    notes: str | None,
) -> str:
    return (
        f"- [{status.upper()}] {title}\n"
        f"  Steps: {steps if steps else 'not recorded'}\n"
        f"  Expected result: {expected_result if expected_result else 'not recorded'}\n"
        f"  Executor notes: {notes or 'none'}"
    )


def build_triage_user_prompt(run_name: str, problem_lines: list[str]) -> str:
    return f"Run: {run_name}\n\nFailed/skipped results:\n" + "\n".join(problem_lines)
