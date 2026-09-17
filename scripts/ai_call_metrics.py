"""
Course M6 (provider gateway and AI-call telemetry) — call summary.

Parses ai_calls.jsonl (one JSON object per line, written by
api/ai_gateway.py's log_ai_call() after every AI Test Generation / AI
Failure Triage call) and computes call counts, mean latency, total tokens
in/out, and error rate, overall and per provider.

Cost is deliberately NOT computed here: hardcoding a $/token rate risks
silently going stale as providers reprice, and this repo's "never invent
numbers" convention (see evals/README.md, the KPI dashboard's "Not yet
measured" cards) treats a wrong number as worse than an honestly absent
one. Token counts and latency are real, provider-reported facts; a cost
figure from them needs a currently-accurate rate this script doesn't have.

Usage:
    python scripts/ai_call_metrics.py [path-to-jsonl, default: ai-call-logs/ai_calls.jsonl]
"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_LOG_PATH = Path("ai-call-logs/ai_calls.jsonl")


def load_records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    return records


def _empty_summary() -> dict:
    return {
        "total_calls": 0,
        "error_rate": None,
        "mean_latency_ms": None,
        "total_tokens_in": 0,
        "total_tokens_out": 0,
        "by_provider": {},
    }


def compute_summary(records: list[dict]) -> dict:
    if not records:
        return _empty_summary()

    by_provider = defaultdict(lambda: {"calls": 0, "errors": 0, "tokens_in": 0, "tokens_out": 0, "latencies": []})
    for r in records:
        bucket = by_provider[r.get("provider", "unknown")]
        bucket["calls"] += 1
        if r.get("outcome") != "success":
            bucket["errors"] += 1
        bucket["tokens_in"] += r.get("tokens_in") or 0
        bucket["tokens_out"] += r.get("tokens_out") or 0
        bucket["latencies"].append(r.get("latency_ms", 0.0))

    by_provider_summary = {
        provider: {
            "calls": b["calls"],
            "error_rate": b["errors"] / b["calls"],
            "mean_latency_ms": statistics.mean(b["latencies"]),
            "tokens_in": b["tokens_in"],
            "tokens_out": b["tokens_out"],
        }
        for provider, b in by_provider.items()
    }

    total_errors = sum(1 for r in records if r.get("outcome") != "success")
    return {
        "total_calls": len(records),
        "error_rate": total_errors / len(records),
        "mean_latency_ms": statistics.mean(r.get("latency_ms", 0.0) for r in records),
        "total_tokens_in": sum(r.get("tokens_in") or 0 for r in records),
        "total_tokens_out": sum(r.get("tokens_out") or 0 for r in records),
        "by_provider": by_provider_summary,
    }


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_LOG_PATH
    records = load_records(path)
    print(json.dumps(compute_summary(records), indent=2))


if __name__ == "__main__":
    main()
