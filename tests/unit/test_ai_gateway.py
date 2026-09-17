"""Unit tests for api/ai_gateway.py — the pluggable provider router (course
milestone M6). Anthropic is monkeypatched the same way tests/api/test_ai_generate.py
does; Ollama/Groq are monkeypatched at httpx.post so no real network call is made.
"""
import json
from pathlib import Path

import anthropic
import httpx

from api import ai_gateway


def _fake_response(json_body, status_code=200):
    return httpx.Response(status_code, json=json_body, request=httpx.Request("POST", "http://test"))


class _FakeContentBlock:
    def __init__(self, text):
        self.text = text


class _FakeUsage:
    def __init__(self, input_tokens, output_tokens):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeMessage:
    def __init__(self, text, model="claude-haiku-4-5-20251001", usage=None):
        self.content = [_FakeContentBlock(text)]
        self.model = model
        self.usage = usage


class _FakeMessages:
    def __init__(self, response_text=None, raise_exc=None, usage=None):
        self._response_text = response_text
        self._raise_exc = raise_exc
        self._usage = usage

    def create(self, **kwargs):
        if self._raise_exc:
            raise self._raise_exc
        return _FakeMessage(self._response_text, usage=self._usage)


class _FakeAnthropic:
    response_text = None
    raise_exc = None
    usage = None

    def __init__(self, api_key=None):
        self.messages = _FakeMessages(self.response_text, self.raise_exc, self.usage)


def _install_fake_anthropic(monkeypatch, response_text=None, raise_exc=None, usage=None):
    fake_cls = type("_FakeAnthropic", (_FakeAnthropic,), {
        "response_text": response_text, "raise_exc": raise_exc, "usage": usage,
    })
    monkeypatch.setattr(anthropic, "Anthropic", fake_cls)


# --- is_configured -----------------------------------------------------------

def test_is_configured_anthropic_true_when_key_set(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "key")
    assert ai_gateway.is_configured("anthropic") is True


def test_is_configured_anthropic_false_when_key_missing(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert ai_gateway.is_configured("anthropic") is False


def test_is_configured_groq_false_when_key_missing(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert ai_gateway.is_configured("groq") is False


def test_is_configured_ollama_always_true():
    assert ai_gateway.is_configured("ollama") is True


# --- complete(): anthropic -----------------------------------------------------

def test_complete_anthropic_success(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, response_text="hello", usage=_FakeUsage(10, 5))

    result = ai_gateway.complete("system", "user", provider="anthropic", model="claude-haiku-4-5-20251001")

    assert result.outcome == "success"
    assert result.text == "hello"
    assert result.tokens_in == 10
    assert result.tokens_out == 5
    assert result.provider == "anthropic"
    assert result.latency_ms >= 0


def test_complete_anthropic_missing_key_is_an_error_result(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = ai_gateway.complete("system", "user", provider="anthropic", model="m")
    assert result.outcome == "error"
    assert "ANTHROPIC_API_KEY" in result.error


def test_complete_anthropic_upstream_error_is_an_error_result(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    _install_fake_anthropic(monkeypatch, raise_exc=RuntimeError("upstream down"))

    result = ai_gateway.complete("system", "user", provider="anthropic", model="m")
    assert result.outcome == "error"
    assert result.error == "upstream down"
    assert result.text is None


# --- complete(): ollama ---------------------------------------------------------

def test_complete_ollama_success(monkeypatch):
    def fake_post(url, json, timeout):
        assert url == "http://localhost:11434/api/chat"
        return _fake_response({
            "message": {"content": "ollama says hi"}, "prompt_eval_count": 20, "eval_count": 8,
        })

    monkeypatch.setattr(ai_gateway.httpx, "post", fake_post)
    result = ai_gateway.complete("system", "user", provider="ollama", model="qwen2.5:0.5b")

    assert result.outcome == "success"
    assert result.text == "ollama says hi"
    assert result.tokens_in == 20
    assert result.tokens_out == 8


def test_complete_ollama_empty_response_is_an_error_result(monkeypatch):
    def fake_post(url, json, timeout):
        return _fake_response({"message": {"content": ""}})

    monkeypatch.setattr(ai_gateway.httpx, "post", fake_post)
    result = ai_gateway.complete("system", "user", provider="ollama", model="qwen2.5:0.5b")
    assert result.outcome == "error"


def test_complete_ollama_unreachable_is_an_error_result(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(ai_gateway.httpx, "post", fake_post)
    result = ai_gateway.complete("system", "user", provider="ollama", model="qwen2.5:0.5b")
    assert result.outcome == "error"


def test_complete_ollama_uses_custom_host(monkeypatch):
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        return _fake_response({"message": {"content": "hi"}})

    monkeypatch.setattr(ai_gateway.httpx, "post", fake_post)
    ai_gateway.complete("system", "user", provider="ollama", model="m", host="http://ollama-box:11434")
    assert captured["url"] == "http://ollama-box:11434/api/chat"


# --- complete(): groq ------------------------------------------------------------

def test_complete_groq_success(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "fake-groq-key")

    def fake_post(url, headers, json, timeout):
        assert url == ai_gateway.GROQ_API_URL
        assert headers["Authorization"] == "Bearer fake-groq-key"
        return _fake_response({
            "choices": [{"message": {"content": "groq says hi"}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 6},
        })

    monkeypatch.setattr(ai_gateway.httpx, "post", fake_post)
    result = ai_gateway.complete("system", "user", provider="groq", model="llama-3.1-8b-instant")

    assert result.outcome == "success"
    assert result.text == "groq says hi"
    assert result.tokens_in == 12
    assert result.tokens_out == 6


def test_complete_groq_missing_key_is_an_error_result(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    result = ai_gateway.complete("system", "user", provider="groq", model="m")
    assert result.outcome == "error"
    assert "GROQ_API_KEY" in result.error


# --- complete(): unknown provider -------------------------------------------------

def test_complete_unknown_provider_is_an_error_result():
    result = ai_gateway.complete("system", "user", provider="not-a-real-provider", model="m")
    assert result.outcome == "error"
    assert "Unknown AI provider" in result.error


# --- log_ai_call ---------------------------------------------------------------

def test_log_ai_call_appends_one_json_line(tmp_path):
    log_path = tmp_path / "ai_calls.jsonl"
    result = ai_gateway.AICallResult(
        text="hi", provider="anthropic", model="claude-haiku-4-5-20251001",
        tokens_in=10, tokens_out=5, latency_ms=123.456, outcome="success",
    )
    ai_gateway.log_ai_call(result, feature="test_generation", log_path=log_path)

    lines = log_path.read_text().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["feature"] == "test_generation"
    assert record["provider"] == "anthropic"
    assert record["tokens_in"] == 10
    assert record["latency_ms"] == 123.5
    assert record["outcome"] == "success"
    assert "timestamp" in record


def test_log_ai_call_appends_without_overwriting(tmp_path):
    log_path = tmp_path / "ai_calls.jsonl"
    result = ai_gateway.AICallResult(
        text="hi", provider="ollama", model="m", tokens_in=1, tokens_out=1,
        latency_ms=1.0, outcome="success",
    )
    ai_gateway.log_ai_call(result, feature="triage", log_path=log_path)
    ai_gateway.log_ai_call(result, feature="triage", log_path=log_path)
    assert len(log_path.read_text().splitlines()) == 2


def test_log_ai_call_never_raises_on_an_unwritable_path():
    result = ai_gateway.AICallResult(
        text="hi", provider="ollama", model="m", tokens_in=1, tokens_out=1,
        latency_ms=1.0, outcome="success",
    )
    # A path under a file (not a directory) can never be created - mkdir raises.
    unwritable = Path(__file__) / "impossible" / "ai_calls.jsonl"
    ai_gateway.log_ai_call(result, feature="triage", log_path=unwritable)
