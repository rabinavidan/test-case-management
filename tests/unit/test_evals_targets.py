"""Unit tests for evals/targets/test_generation.py and evals/targets/triage.py
— the EvalTarget wiring that connects api/ai_prompts.py's real prompts and
evals/scorers.py's / evals/triage_scorers.py's real scorers to the generic
harness. Client calls are scripted stubs; nothing here hits a real Ollama
server.
"""
import json

import pytest

from evals.harness import run_suite
from evals.targets import TARGETS
from evals.targets.test_generation import TARGET as TEST_GENERATION_TARGET
from evals.targets.test_generation import _build_prompt as build_test_generation_prompt
from evals.targets.test_generation import _score as score_test_generation
from evals.targets.triage import TARGET as TRIAGE_TARGET
from evals.targets.triage import _build_prompt as build_triage_prompt
from evals.targets.triage import _score as score_triage


class _ScriptedClient:
    def __init__(self, responses):
        self._responses = responses
        self._i = 0

    def generate(self, system_prompt, user_prompt, temperature=0.7):
        response = self._responses[self._i % len(self._responses)]
        self._i += 1
        return response


def test_targets_registry_has_both_features():
    assert set(TARGETS) == {"test_generation", "triage"}
    assert TARGETS["test_generation"].TARGET is TEST_GENERATION_TARGET
    assert TARGETS["triage"].TARGET is TRIAGE_TARGET


# --- test_generation target -------------------------------------------------

def test_test_generation_build_prompt_includes_case_fields():
    case = {"suite_name": "Auth", "feature_description": "Login flow", "count": 3}
    system_prompt, user_prompt = build_test_generation_prompt(case)
    assert "QA engineer" in system_prompt
    assert "Auth" in user_prompt
    assert "Login flow" in user_prompt
    assert "3 test cases" in user_prompt


def test_test_generation_score_parses_and_scores():
    case = {"count": 1, "required_keywords": ["login"]}
    raw = json.dumps({"test_cases": [{
        "title": "Login", "description": "d", "steps": "s", "expected_result": "r", "priority": "high",
    }]})
    scores = score_test_generation(raw, case)
    assert scores["schema_score"] == 1.0
    assert scores["keyword_coverage_score"] == 1.0


def test_test_generation_score_invalid_json_raises():
    with pytest.raises(json.JSONDecodeError):
        score_test_generation("not json", {"count": 1, "required_keywords": []})


def test_test_generation_run_suite_against_real_dataset():
    # Covers every required_keyword across every one of the dataset's 15
    # cases (see evals/README.md's "Golden datasets" section for the
    # easy/edge/known_hard/adversarial mix) and returns 5 copies - the
    # dataset's largest "count" - so this stub scores well regardless of
    # which case it's answering for.
    kitchen_sink = (
        "login password invalid lockout reset email link expired csv export empty "
        "create rename delete admin priority filter status pass fail percentage zero "
        "environment staging prod unrecognised pagination search bulk partial failure "
        "websocket reconnect resync live viewer 403 role "
        "'api key' 503 'invalid json' 502 kafka event idempotent redelivered "
        "seed duplicate concurrent contact 'required field' 'invalid email' 'rate-limited'"
    )
    good_response = json.dumps({"test_cases": [{
        "title": "t", "description": kitchen_sink,
        "steps": "s", "expected_result": "r", "priority": "high",
    }] * 5})
    client = _ScriptedClient([good_response])
    report = run_suite("evals/datasets/test_generation.json", client, TEST_GENERATION_TARGET, n_runs=1)

    assert len(report.cases) == 15
    assert report.overall_pass(
        TARGETS["test_generation"].DEFAULT_MIN_THRESHOLDS,
        TARGETS["test_generation"].DEFAULT_MAX_THRESHOLDS,
        TARGETS["test_generation"].DEFAULT_MAX_ERROR_RATE,
    ) is True


# --- triage target -----------------------------------------------------------

def test_triage_build_prompt_includes_problem_lines():
    case = {
        "run_name": "Nightly",
        "problem_results": [
            {"title": "Login fails", "status": "fail", "steps": "s", "expected_result": "r", "notes": "n"},
        ],
    }
    system_prompt, user_prompt = build_triage_prompt(case)
    assert "triaging a failed test run" in system_prompt
    assert "Nightly" in user_prompt
    assert "[FAIL] Login fails" in user_prompt


def test_triage_score_scores_free_text():
    case = {"required_keywords": ["timeout"]}
    scores = score_triage("The failures share a timeout root cause. Check the auth service. Retry after that.", case)
    assert scores["non_empty_score"] == 1.0
    assert scores["keyword_coverage_score"] == 1.0


def test_triage_run_suite_against_real_dataset():
    # Covers every required_keyword across every one of the dataset's 15
    # cases (see evals/README.md's "Golden datasets" section), 4 sentences
    # (within sentence_count_score's 2-6 range), no literal [FAIL]/[SKIP]
    # markers (keeps verbatim_echo_rate at 0).
    good_summary = (
        "These failures span session timeout and login issues, environment mismatch between "
        "staging and preprod, and flaky retry timing during E2E runs. "
        "Export and CSV errors include empty suite handling and pagination search boundaries, "
        "while permission checks return 403 for viewers without proper role enforcement, and "
        "repeated contact submissions are not rate limited within the cooldown, returning no 429. "
        "WebSocket reconnect leaves stale state, Kafka consumer lag delays event delivery, "
        "concurrent admin edits create a race and conflict with a database constraint violation "
        "and duplicate suite names without clear validation, and a bulk import of a large payload "
        "exceeds its timeout. "
        "The AI generation endpoint needs a valid api key or returns 503, a malformed model "
        "response causes a failure, an unrelated email provider outage also triggered a "
        "temporary 503, and a rendering exception with a null pointer explains an unrelated "
        "verbatim-echo case."
    )
    client = _ScriptedClient([good_summary])
    report = run_suite("evals/datasets/triage.json", client, TRIAGE_TARGET, n_runs=1)

    assert len(report.cases) == 15
    assert report.overall_pass(
        TARGETS["triage"].DEFAULT_MIN_THRESHOLDS,
        TARGETS["triage"].DEFAULT_MAX_THRESHOLDS,
        TARGETS["triage"].DEFAULT_MAX_ERROR_RATE,
    ) is True
