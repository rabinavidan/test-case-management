"""Minimal HTTP client for a local Ollama server.

Deliberately not using an SDK — this repo already calls model HTTP APIs
directly with httpx when a full SDK would be overkill for one endpoint (see
scripts/coverage_gap_agent.py's Gemini client). Ollama runs locally with no
API key and no per-call cost, which is what makes it practical to call it
many times per eval case (see evals/harness.py) to measure a non-deterministic
model's run-to-run consistency, not just a single response's quality.
"""
import httpx

DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1"
DEFAULT_TIMEOUT = 120.0


class OllamaUnavailableError(RuntimeError):
    """The local Ollama server could not be reached, or returned an error
    or empty response. Callers treat this the same way the rest of this
    repo treats a missing ANTHROPIC_API_KEY: skip cleanly, don't crash."""


class OllamaClient:
    def __init__(
        self,
        host: str | None = None,
        model: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        http_client: httpx.Client | None = None,
    ):
        self.host = (host or DEFAULT_HOST).rstrip("/")
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout
        # Injectable so tests can supply an httpx.Client(transport=MockTransport(...))
        # instead of hitting a real server — same dependency-injection pattern
        # scripts/coverage_gap_agent.py uses for its Gemini/GitHub HTTP calls.
        self._http_client = http_client or httpx.Client()

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """Calls Ollama's /api/chat (non-streaming) and returns the
        assistant message's raw text content."""
        try:
            response = self._http_client.post(
                f"{self.host}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                    "options": {"temperature": temperature},
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaUnavailableError(f"Ollama request failed: {exc}") from exc

        data = response.json()
        content = data.get("message", {}).get("content", "")
        if not content:
            raise OllamaUnavailableError("Ollama returned an empty response")
        return content
