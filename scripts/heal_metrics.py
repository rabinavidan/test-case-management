"""
Course M4 (Self-healing guardrails and metrics) — heal outcome metrics.

Parses heal outcome records (one JSON object per line) written by the
playwright-test-healer agent each time it works a failing test — see
.claude/agents/playwright-test-healer.md for the schema and the rule these
metrics measure compliance with: a heal_type of "behavior_change" (a
suspected real product defect) must never be silently healed or skipped; it
must be escalated.

Computes two rates from those records:
- heal_success_rate: of the LOCATOR/TIMING-drift heals (the only kind the
  healer agent is allowed to auto-fix), the fraction that were actually
  healed rather than escalated or skipped.
- false_heal_rate: of the BEHAVIOR-CHANGE heals (suspected real defects),
  the fraction that were NOT escalated - i.e. the false-heal failure mode
  the plan calls out, where a real defect gets silently healed or skipped
  instead of reported. This should always be 0; a nonzero rate means the
  guardrail in the healer prompt was violated.

Both rates are None (not 0) when there are no records of that heal_type yet
- "no data" and "0% success" are different facts, and this script never
  invents a number to fill the gap.

Usage:
    python scripts/heal_metrics.py [path-to-jsonl, default: heal-outcomes/heal_outcomes.jsonl]
"""
import json
import sys
from pathlib import Path

DEFAULT_RECORDS_PATH = Path("heal-outcomes/heal_outcomes.jsonl")
LOCATOR_TIMING_TYPES = {"locator_drift", "timing_drift"}
BEHAVIOR_CHANGE_TYPE = "behavior_change"


def load_records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    return records


def compute_heal_metrics(records: list[dict]) -> dict:
    locator_timing = [r for r in records if r.get("heal_type") in LOCATOR_TIMING_TYPES]
    behavior_change = [r for r in records if r.get("heal_type") == BEHAVIOR_CHANGE_TYPE]

    heal_success_rate = (
        sum(1 for r in locator_timing if r.get("outcome") == "healed") / len(locator_timing)
        if locator_timing else None
    )
    false_heal_rate = (
        sum(1 for r in behavior_change if r.get("outcome") != "escalated") / len(behavior_change)
        if behavior_change else None
    )
    return {
        "total_records": len(records),
        "locator_timing_heals": len(locator_timing),
        "behavior_change_heals": len(behavior_change),
        "heal_success_rate": heal_success_rate,
        "false_heal_rate": false_heal_rate,
    }


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RECORDS_PATH
    records = load_records(path)
    metrics = compute_heal_metrics(records)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
