"""Thin, pluggable AI provider router (course milestone M6).

Before this module, api/main.py's two live AI endpoints (AI Test
Generation, AI Failure Triage) each hand-rolled their own `anthropic.
Anthropic(...)` call, and switching either to a different model or
provider meant editing that endpoint's code. `complete()` is the one
interface both now call through; which provider/model actually runs is an
`AI_PROVIDER`/`AI_MODEL` environment variable, not a code change — the
"Done when" criterion this milestone exists to satisfy.

Deliberately no heavy SDK beyond what's already a repo dependency: the
Anthropic backend still uses the existing `anthropic` package exactly as
before (so every test that monkeypatches `anthropic.Anthropic` keeps
working, unmodified), and the Ollama/Groq backends call their HTTP APIs
directly with `httpx`, the same "thin client over the HTTP API instead of
an SDK" convention this repo already uses (`evals/ollama_client.py`,
`scripts/coverage_gap_agent.py`'s Gemini client). This module doesn't
absorb those existing clients — each stays independent — it standardizes
the *calling* interface for the two live product endpoints that route
through it.

Deliberately monolith-only (api/) this milestone, same scoping as M5: the
microservices `services/ai/` variant, `scripts/coverage_gap_agent.py`
(Gemini), and the LangChain-based `agents/` Test Plan Reviewer all keep
their own hand-rolled clients for now — migrating every AI call in the repo
through one router is a larger change than this milestone's effort budget;
see evals/README.md-style "Future work" framing in this repo's README.

Every call — success or failure — returns an AICallResult carrying model,
provider, token counts, latency, and outcome. log_ai_call() appends one as
a JSON line, the audit trail scripts/ai_call_metrics.py reads for the KPI
dashboard's cost/latency summary — the same append-only-log-plus-metrics-
script pattern as scripts/heal_metrics.py (M4) and scripts/flake_report.py.
"""
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Vercel's filesystem is read-only except /tmp (same constraint
# api/database.py's SQLite fallback already lives with) - in production
# this log is ephemeral per serverless instance, not a durable store.
# Locally/in CI it writes into the repo tree, gitignored (see .gitignore).
DEFAULT_LOG_PATH = Path("/tmp/ai-call-logs/ai_calls.jsonl") if os.getenv("VERCEL") else Path("ai-call-logs/ai_calls.jsonl")
DEFAULT_OLLAMA_HOST = "http://localhost:11434"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


@dataclass
class AICallResult:
    text: str | None
    provider: str
    model: str
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: float
    outcome: str  # "success" | "error"
    error: str | None = None


def is_configured(provider: str) -> bool:
    """Whether the credentials this provider needs are present. Ollama
    needs none (a local server, checked for reachability by the call
    itself, not here) - matches the "unavailable: not configured" upfront
    check api/main.py's endpoints already did for Anthropic, generalized to
    whichever provider is actually configured."""
    if provider == "anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    if provider == "groq":
        return bool(os.getenv("GROQ_API_KEY"))
    return True


def complete(
    system_prompt: str,
    user_prompt: str,
    *,
    provider: str,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    host: str | None = None,
) -> AICallResult:
    """Routes to the requested provider's backend and always returns an
    AICallResult, even for a failed call (outcome="error", .error set)
    rather than letting each backend's own exception type leak to the
    caller - a caller that wants the old "raise on failure" behavior reads
    result.error and raises its own exception from it."""
    start = time.monotonic()
    try:
        if provider == "anthropic":
            text, tokens_in, tokens_out = _call_anthropic(system_prompt, user_prompt, model, max_tokens)
        elif provider == "ollama":
            text, tokens_in, tokens_out = _call_ollama(system_prompt, user_prompt, model, temperature, host)
        elif provider == "groq":
            text, tokens_in, tokens_out = _call_groq(system_prompt, user_prompt, model, temperature, max_tokens)
        else:
            raise ValueError(f"Unknown AI provider: {provider!r}")
        return AICallResult(
            text=text, provider=provider, model=model,
            tokens_in=tokens_in, tokens_out=tokens_out,
            latency_ms=(time.monotonic() - start) * 1000, outcome="success",
        )
    except Exception as exc:
        return AICallResult(
            text=None, provider=provider, model=model,
            tokens_in=None, tokens_out=None,
            latency_ms=(time.monotonic() - start) * 1000, outcome="error", error=str(exc),
        )


def _call_anthropic(system_prompt: str, user_prompt: str, model: str, max_tokens: int):
    import anthropic
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model, max_tokens=max_tokens, system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = message.content[0].text
    usage = getattr(message, "usage", None)
    tokens_in = getattr(usage, "input_tokens", None) if usage else None
    tokens_out = getattr(usage, "output_tokens", None) if usage else None
    return text, tokens_in, tokens_out


def _call_ollama(system_prompt: str, user_prompt: str, model: str, temperature: float, host: str | None):
    url = f"{(host or os.getenv('OLLAMA_HOST') or DEFAULT_OLLAMA_HOST).rstrip('/')}/api/chat"
    response = httpx.post(url, json={
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": temperature},
    }, timeout=120)
    response.raise_for_status()
    data = response.json()
    text = data.get("message", {}).get("content", "")
    if not text:
        raise RuntimeError("Ollama returned an empty response")
    # Ollama's own token-count fields, not an estimate.
    return text, data.get("prompt_eval_count"), data.get("eval_count")


def _call_groq(system_prompt: str, user_prompt: str, model: str, temperature: float, max_tokens: int):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")
    response = httpx.post(
        GROQ_API_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return text, usage.get("prompt_tokens"), usage.get("completion_tokens")


@dataclass
class ToolCallRecord:
    name: str
    input: dict
    result_preview: str
    is_error: bool = False


@dataclass
class ToolLoopResult:
    call: AICallResult
    tool_calls: list
    iterations: int
    hit_iteration_cap: bool = False


def complete_with_tools(
    system_prompt: str,
    user_prompt: str,
    *,
    tools: list[dict],
    tool_handlers: dict,
    model: str,
    max_tokens: int = 1024,
    max_iterations: int = 4,
    provider: str = "anthropic",
    host: str | None = None,
) -> ToolLoopResult:
    """Bounded tool-use loop (course milestone M7 - see docs/ai-roadmap.md).

    The model gets `tools` (Anthropic tool schemas) and may answer with
    tool_use blocks instead of text; each is dispatched to
    tool_handlers[name](**input) and the result sent back as a tool_result,
    until the model answers in plain text or max_iterations is reached. On
    the cap, one last call is made with tool_choice "none" so the model must
    answer with what it already has - the loop is always bounded.

    A handler that raises is reported back to the model as an is_error
    tool_result (the model can recover or answer anyway) rather than
    failing the request; an unknown tool name is handled the same way.
    Like complete(), this never raises: any API failure comes back as an
    AICallResult with outcome="error". Token counts are summed across every
    turn of the loop so log_ai_call() reports the true cost.

    provider="anthropic" (the in-product default) or "ollama" (M10: lets the
    trajectory eval measure a real local model in CI with no API key - see
    evals/triage_trajectory_eval.py). Both take the same Anthropic-shaped
    `tools` list and return the same ToolLoopResult; Ollama has no
    tool_choice, so its forced last turn simply omits the tools.
    """
    if provider == "ollama":
        return _complete_with_tools_ollama(system_prompt, user_prompt, tools, tool_handlers,
                                           model, max_tokens, max_iterations, host)
    if provider != "anthropic":
        return ToolLoopResult(AICallResult(
            text=None, provider=provider, model=model, tokens_in=None, tokens_out=None,
            latency_ms=0.0, outcome="error", error=f"Tool use is not supported for provider {provider!r}",
        ), [], 0)
    import anthropic

    start = time.monotonic()
    tokens_in = tokens_out = 0
    records: list[ToolCallRecord] = []
    messages: list[dict] = [{"role": "user", "content": user_prompt}]
    iterations = 0
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not configured")
        client = anthropic.Anthropic(api_key=api_key)
        while True:
            iterations += 1
            force_answer = iterations > max_iterations
            kwargs = {
                "model": model, "max_tokens": max_tokens, "system": system_prompt,
                "messages": messages, "tools": tools,
            }
            if force_answer:
                kwargs["tool_choice"] = {"type": "none"}
            message = client.messages.create(**kwargs)
            usage = getattr(message, "usage", None)
            tokens_in += getattr(usage, "input_tokens", 0) or 0 if usage else 0
            tokens_out += getattr(usage, "output_tokens", 0) or 0 if usage else 0

            blocks = [_block_to_dict(b) for b in message.content]
            tool_uses = [b for b in blocks if b["type"] == "tool_use"]
            if not tool_uses or force_answer:
                text = "".join(b.get("text", "") for b in blocks if b["type"] == "text").strip()
                if not text:
                    raise RuntimeError("Model returned no text answer")
                call = AICallResult(
                    text=text, provider="anthropic", model=model,
                    tokens_in=tokens_in, tokens_out=tokens_out,
                    latency_ms=(time.monotonic() - start) * 1000, outcome="success",
                )
                return ToolLoopResult(call, records, iterations - 1 if force_answer else iterations,
                                      hit_iteration_cap=force_answer)

            messages.append({"role": "assistant", "content": blocks})
            results = []
            for use in tool_uses:
                output, is_error = _dispatch_tool(tool_handlers, use["name"], use["input"])
                records.append(ToolCallRecord(use["name"], use["input"] or {}, output[:300], is_error))
                results.append({
                    "type": "tool_result", "tool_use_id": use["id"],
                    "content": output, "is_error": is_error,
                })
            messages.append({"role": "user", "content": results})
    except Exception as exc:
        call = AICallResult(
            text=None, provider="anthropic", model=model,
            tokens_in=tokens_in or None, tokens_out=tokens_out or None,
            latency_ms=(time.monotonic() - start) * 1000, outcome="error", error=str(exc),
        )
        return ToolLoopResult(call, records, iterations)


def _dispatch_tool(tool_handlers: dict, name: str, tool_input) -> tuple[str, bool]:
    """Runs one tool call; a raising handler or an unknown tool becomes an
    error string for the model, never an exception for the caller."""
    handler = tool_handlers.get(name)
    try:
        if handler is None:
            raise ValueError(f"Unknown tool: {name}")
        if not isinstance(tool_input or {}, dict):
            raise ValueError("Tool arguments must be a JSON object")
        return json.dumps(handler(**(tool_input or {})), default=str), False
    except Exception as exc:
        return f"Error: {exc}", True


def _complete_with_tools_ollama(system_prompt, user_prompt, tools, tool_handlers, model,
                                max_tokens, max_iterations, host) -> ToolLoopResult:
    """Same loop over Ollama's /api/chat tool calling (OpenAI-style function
    schemas, role "tool" results). Deterministic sampling (temperature 0,
    fixed seed) so a trajectory eval's repeat runs measure the prompt, not
    sampling noise."""
    url = f"{(host or os.getenv('OLLAMA_HOST') or DEFAULT_OLLAMA_HOST).rstrip('/')}/api/chat"
    functions = [{"type": "function", "function": {
        "name": t["name"], "description": t.get("description", ""), "parameters": t["input_schema"],
    }} for t in tools]
    start = time.monotonic()
    tokens_in = tokens_out = 0
    records: list[ToolCallRecord] = []
    messages: list[dict] = [{"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}]
    iterations = 0
    try:
        while True:
            iterations += 1
            force_answer = iterations > max_iterations
            body = {"model": model, "messages": messages, "stream": False,
                    "options": {"temperature": 0, "seed": 7, "num_predict": max_tokens}}
            if not force_answer:
                body["tools"] = functions
            response = httpx.post(url, json=body, timeout=300)
            response.raise_for_status()
            data = response.json()
            tokens_in += data.get("prompt_eval_count") or 0
            tokens_out += data.get("eval_count") or 0
            message = data.get("message") or {}
            calls = message.get("tool_calls") or []
            if not calls or force_answer:
                text = (message.get("content") or "").strip()
                if not text:
                    raise RuntimeError("Model returned no text answer")
                call = AICallResult(
                    text=text, provider="ollama", model=model,
                    tokens_in=tokens_in, tokens_out=tokens_out,
                    latency_ms=(time.monotonic() - start) * 1000, outcome="success",
                )
                return ToolLoopResult(call, records, iterations - 1 if force_answer else iterations,
                                      hit_iteration_cap=force_answer)

            messages.append({"role": "assistant", "content": message.get("content") or "",
                             "tool_calls": calls})
            for c in calls:
                fn = c.get("function") or {}
                name, args = fn.get("name", ""), fn.get("arguments") or {}
                if isinstance(args, str):  # some models emit the arguments as a JSON string
                    try:
                        args = json.loads(args)
                    except ValueError:
                        pass
                output, is_error = _dispatch_tool(tool_handlers, name, args)
                records.append(ToolCallRecord(name, args if isinstance(args, dict) else {"raw": args},
                                              output[:300], is_error))
                messages.append({"role": "tool", "tool_name": name, "content": output})
    except Exception as exc:
        call = AICallResult(
            text=None, provider="ollama", model=model,
            tokens_in=tokens_in or None, tokens_out=tokens_out or None,
            latency_ms=(time.monotonic() - start) * 1000, outcome="error", error=str(exc),
        )
        return ToolLoopResult(call, records, iterations)


def _block_to_dict(block) -> dict:
    """Normalizes an SDK content block (or a test double) to the plain dict
    shape the Messages API accepts back in the next turn."""
    if getattr(block, "type", "text") == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": dict(block.input or {})}
    return {"type": "text", "text": getattr(block, "text", "")}


def log_ai_call(result: AICallResult, feature: str, log_path: Path = DEFAULT_LOG_PATH) -> None:
    """Appends one JSON line per call. Never raises: a logging failure
    (read-only filesystem, disk full) must not fail the AI call it's riding
    alongside - the same graceful-degrade convention evals/llm_judge.py
    uses for a judge-call failure."""
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "feature": feature,
        "provider": result.provider,
        "model": result.model,
        "tokens_in": result.tokens_in,
        "tokens_out": result.tokens_out,
        "latency_ms": round(result.latency_ms, 1),
        "outcome": result.outcome,
    }
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a") as f:
            f.write(json.dumps(record) + "\n")
    except OSError:
        pass
