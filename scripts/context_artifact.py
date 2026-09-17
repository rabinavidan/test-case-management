"""
Course M8 (shared context-capture artifact) — schema and validator.

Before this milestone, each Playwright agent (planner, generator, healer -
see .claude/agents/playwright-test-*.md) re-explored the running app from
scratch every time it ran, even when a planner session had already mapped
the exact same flow minutes earlier. The planner now writes a structured
JSON artifact alongside its markdown plan - specs/<plan-basename>.context.json
- and the generator and healer read it first, using its recorded
role/name/state locators instead of re-deriving them via a fresh
browser_snapshot(). Preferring an accessibility-tree locator (role + name)
over a brittle CSS selector is the same principle e2e/README.md's
"Self-healing guardrails" section (course M4) already leans on for
distinguishing locator drift from a real behavior change - this milestone
gives that principle a concrete, checkable artifact instead of leaving it
as agent-prompt prose alone.

This module is that check: not run in CI (these artifacts are authoring-time
output, same as specs/*.md itself - see specs/README.md), but available for
a human or an agent to validate a context artifact's shape before relying
on it, and to know the exact schema to produce or consume.
"""
REQUIRED_TOP_LEVEL_FIELDS = ("flow", "captured_at", "journey", "elements")
REQUIRED_JOURNEY_FIELDS = ("step", "description", "url")
REQUIRED_ELEMENT_FIELDS = ("role", "name")


def validate_context_artifact(data: dict) -> list[str]:
    """Returns a list of human-readable validation errors — empty if `data`
    is a well-formed context artifact. Never raises: a malformed artifact is
    a finding to report, not a crash, matching this repo's other
    validate-and-report tooling (e.g. evals/baseline.py's check_regressions)."""
    errors = []
    if not isinstance(data, dict):
        return ["artifact must be a JSON object"]

    for field in REQUIRED_TOP_LEVEL_FIELDS:
        if field not in data:
            errors.append(f"missing required field: {field!r}")

    if "flow" in data and not str(data["flow"]).strip():
        errors.append("'flow' must be a non-empty string")

    journey = data.get("journey")
    if journey is not None:
        if not isinstance(journey, list) or not journey:
            errors.append("'journey' must be a non-empty list")
        else:
            for i, step in enumerate(journey):
                errors.extend(_validate_journey_step(i, step))

    elements = data.get("elements")
    if elements is not None:
        if not isinstance(elements, list):
            errors.append("'elements' must be a list")
        else:
            for i, element in enumerate(elements):
                errors.extend(_validate_element(i, element))

    return errors


def _validate_journey_step(index: int, step) -> list[str]:
    if not isinstance(step, dict):
        return [f"journey[{index}] must be an object"]
    errors = [
        f"journey[{index}] missing required field: {field!r}"
        for field in REQUIRED_JOURNEY_FIELDS
        if field not in step
    ]
    if "description" in step and not str(step["description"]).strip():
        errors.append(f"journey[{index}].description must be non-empty")
    return errors


def _validate_element(index: int, element) -> list[str]:
    if not isinstance(element, dict):
        return [f"elements[{index}] must be an object"]
    errors = [
        f"elements[{index}] missing required field: {field!r}"
        for field in REQUIRED_ELEMENT_FIELDS
        if field not in element
    ]
    for field in ("role", "name"):
        if field in element and not str(element[field]).strip():
            errors.append(f"elements[{index}].{field} must be non-empty")
    return errors


def is_valid_context_artifact(data: dict) -> bool:
    return not validate_context_artifact(data)
