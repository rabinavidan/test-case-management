"""Unit tests for evals/prompt_versions.py — pure hashing, no I/O."""
from evals.prompt_versions import prompt_version


def test_prompt_version_is_deterministic():
    assert prompt_version("You are a helpful assistant.") == prompt_version("You are a helpful assistant.")


def test_prompt_version_changes_with_any_text_change():
    assert prompt_version("Generate test cases.") != prompt_version("Generate test cases!")


def test_prompt_version_is_an_eight_char_hex_string():
    version = prompt_version("some prompt text")
    assert len(version) == 8
    int(version, 16)  # raises ValueError if not valid hex


def test_prompt_version_of_empty_string_is_stable():
    assert prompt_version("") == prompt_version("")
