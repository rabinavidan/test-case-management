"""Unit tests for evals/ollama_client.py — every HTTP call goes through an
injected httpx.Client(transport=MockTransport(...)), so these never require
a real Ollama server."""
import httpx
import pytest

from evals.ollama_client import OllamaClient, OllamaUnavailableError


def _client_with_transport(transport: httpx.MockTransport) -> OllamaClient:
    return OllamaClient(
        host="http://fake-ollama:11434",
        model="llama3.1",
        http_client=httpx.Client(transport=transport),
    )


def test_generate_returns_content():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read()
        assert b"llama3.1" in payload
        return httpx.Response(200, json={"message": {"content": "hello world"}})

    client = _client_with_transport(httpx.MockTransport(handler))
    assert client.generate("system", "user") == "hello world"


def test_generate_sends_system_and_user_messages():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        captured["body"] = json.loads(request.read())
        return httpx.Response(200, json={"message": {"content": "ok"}})

    client = _client_with_transport(httpx.MockTransport(handler))
    client.generate("sys prompt", "user prompt", temperature=0.3)

    messages = captured["body"]["messages"]
    assert messages[0] == {"role": "system", "content": "sys prompt"}
    assert messages[1] == {"role": "user", "content": "user prompt"}
    assert captured["body"]["options"]["temperature"] == 0.3
    assert captured["body"]["stream"] is False


def test_generate_raises_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    client = _client_with_transport(httpx.MockTransport(handler))
    with pytest.raises(OllamaUnavailableError):
        client.generate("system", "user")


def test_generate_raises_on_connection_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    client = _client_with_transport(httpx.MockTransport(handler))
    with pytest.raises(OllamaUnavailableError):
        client.generate("system", "user")


def test_generate_raises_on_empty_content():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": ""}})

    client = _client_with_transport(httpx.MockTransport(handler))
    with pytest.raises(OllamaUnavailableError):
        client.generate("system", "user")


def test_default_host_and_model_and_trailing_slash_stripped():
    client = OllamaClient(host="http://localhost:11434/")
    assert client.host == "http://localhost:11434"
    assert client.model == "llama3.1"
