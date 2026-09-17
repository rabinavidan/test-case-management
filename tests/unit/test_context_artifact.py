"""Unit tests for scripts/context_artifact.py — the shared planner/generator/
healer context-artifact schema (course M8). Pure validation, no I/O."""
from scripts.context_artifact import is_valid_context_artifact, validate_context_artifact

VALID_ARTIFACT = {
    "flow": "suites-crud",
    "captured_at": "2026-09-17T21:00:00Z",
    "journey": [
        {"step": 1, "description": "Navigate to the projects page", "url": "/#projects"},
        {"step": 2, "description": "Open the new-suite modal", "url": "/#projects/1"},
    ],
    "elements": [
        {"role": "button", "name": "New Project", "state": "enabled", "page": "/#projects"},
        {"role": "textbox", "name": "Suite name"},
    ],
}


def test_valid_artifact_has_no_errors():
    assert validate_context_artifact(VALID_ARTIFACT) == []
    assert is_valid_context_artifact(VALID_ARTIFACT) is True


def test_non_dict_artifact_is_invalid():
    errors = validate_context_artifact(["not", "a", "dict"])
    assert errors == ["artifact must be a JSON object"]
    assert is_valid_context_artifact(["not", "a", "dict"]) is False


def test_missing_top_level_fields_are_reported():
    errors = validate_context_artifact({"flow": "x"})
    assert any("captured_at" in e for e in errors)
    assert any("journey" in e for e in errors)
    assert any("elements" in e for e in errors)


def test_empty_flow_is_invalid():
    artifact = {**VALID_ARTIFACT, "flow": "   "}
    errors = validate_context_artifact(artifact)
    assert any("flow" in e for e in errors)


def test_journey_must_be_a_nonempty_list():
    artifact = {**VALID_ARTIFACT, "journey": []}
    errors = validate_context_artifact(artifact)
    assert any("journey" in e and "non-empty" in e for e in errors)


def test_journey_step_missing_field_is_reported():
    artifact = {**VALID_ARTIFACT, "journey": [{"step": 1, "description": "d"}]}  # no url
    errors = validate_context_artifact(artifact)
    assert any("journey[0]" in e and "url" in e for e in errors)


def test_journey_step_blank_description_is_reported():
    artifact = {**VALID_ARTIFACT, "journey": [{"step": 1, "description": "  ", "url": "/"}]}
    errors = validate_context_artifact(artifact)
    assert any("journey[0].description" in e for e in errors)


def test_journey_step_must_be_an_object():
    artifact = {**VALID_ARTIFACT, "journey": ["not an object"]}
    errors = validate_context_artifact(artifact)
    assert errors == ["journey[0] must be an object"]


def test_elements_may_be_empty():
    # Unlike journey, an empty elements list is valid - a purely navigational
    # plan step might record no new interactive elements.
    artifact = {**VALID_ARTIFACT, "elements": []}
    assert validate_context_artifact(artifact) == []


def test_element_missing_name_is_reported():
    artifact = {**VALID_ARTIFACT, "elements": [{"role": "button"}]}
    errors = validate_context_artifact(artifact)
    assert any("elements[0]" in e and "name" in e for e in errors)


def test_element_blank_role_is_reported():
    artifact = {**VALID_ARTIFACT, "elements": [{"role": " ", "name": "Submit"}]}
    errors = validate_context_artifact(artifact)
    assert any("elements[0].role" in e for e in errors)


def test_element_must_be_an_object():
    artifact = {**VALID_ARTIFACT, "elements": ["not an object"]}
    errors = validate_context_artifact(artifact)
    assert errors == ["elements[0] must be an object"]


def test_multiple_errors_are_all_reported_together():
    errors = validate_context_artifact({"journey": [{}], "elements": [{}]})
    assert len(errors) > 3
