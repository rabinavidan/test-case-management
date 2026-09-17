"""
Course M9 (cross-agent orchestration and governance notes) — unified agent
telemetry view.

Combines the two structured telemetry logs this repo's agents write —
scripts/heal_metrics.py's heal-outcomes/heal_outcomes.jsonl (the Playwright
healer, course M4) and scripts/ai_call_metrics.py's ai-call-logs/ai_calls.jsonl
(the AI provider gateway, course M6) — into one report, so a human or CI job
checking "how are the agents doing" reads one command's output instead of
knowing there are two separate logs to look in.

Deliberately a view, not a merge: the two logs record fundamentally
different things (a healing session vs. an AI API call) and each already
has its own metrics function that knows how to summarize its own shape (see
docs/agent-governance.md's "Unified agent telemetry" section for why
forcing them into one schema would blur both rather than clarify either).

Usage:
    python -m scripts.agent_telemetry
    python -m scripts.agent_telemetry --heal-log path/to/heal_outcomes.jsonl --ai-call-log path/to/ai_calls.jsonl
"""
import argparse
import json
import sys
from pathlib import Path

from scripts.ai_call_metrics import DEFAULT_LOG_PATH as DEFAULT_AI_CALL_LOG_PATH
from scripts.ai_call_metrics import compute_summary as compute_ai_call_summary
from scripts.ai_call_metrics import load_records as load_ai_call_records
from scripts.heal_metrics import DEFAULT_RECORDS_PATH as DEFAULT_HEAL_LOG_PATH
from scripts.heal_metrics import compute_heal_metrics
from scripts.heal_metrics import load_records as load_heal_records


def unified_agent_telemetry(heal_log_path: Path, ai_call_log_path: Path) -> dict:
    return {
        "healer": compute_heal_metrics(load_heal_records(heal_log_path)),
        "ai_gateway": compute_ai_call_summary(load_ai_call_records(ai_call_log_path)),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--heal-log", type=Path, default=DEFAULT_HEAL_LOG_PATH)
    parser.add_argument("--ai-call-log", type=Path, default=DEFAULT_AI_CALL_LOG_PATH)
    args = parser.parse_args(argv)

    print(json.dumps(unified_agent_telemetry(args.heal_log, args.ai_call_log), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
