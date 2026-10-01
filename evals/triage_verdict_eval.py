"""Triage-verdict eval: is a failure a product bug, a flaky test, or the
environment? (docs/ai-roadmap.md, "Reliability gaps").

Scores a classifier against evals/datasets/triage_verdicts.json - evidence
in the exact shape api/triage_agent.collect_evidence() produces, each case
labelled by a human. The deterministic heuristic_verdict() baseline is
scored on every run (no model, no key, fully repeatable); it is the same
baseline the triage endpoint cross-checks the agent's verdict against.

Abstaining is allowed - 'unknown' sends the case to a human - but a
confident wrong answer is not, because it is the one that misleads a
triager into chasing a product bug that was really a dead pod. So the
metrics separate the two:
  accuracy          - correct / all cases (abstentions count as not correct)
  coverage          - fraction of cases given a non-'unknown' verdict
  precision         - correct / decided cases (accuracy when it does answer)
  confident_errors  - decided AND wrong; the number --max-confident-errors gates
  repeatable        - every case got the same verdict on --repeats passes

Usage:
    python -m evals.triage_verdict_eval
    python -m evals.triage_verdict_eval --max-confident-errors 0 --min-coverage 0.8
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Callable

from api.triage_agent import VERDICTS, heuristic_verdict

DEFAULT_DATASET = Path(__file__).parent / "datasets" / "triage_verdicts.json"

Classifier = Callable[[dict], str]


def heuristic_classifier(evidence: dict) -> str:
    return heuristic_verdict(evidence)[0]


def evaluate(dataset: dict, classify: Classifier, repeats: int = 1) -> dict:
    per_case, confusion = [], Counter()
    for case in dataset["cases"]:
        runs = [classify(case["evidence"]) for _ in range(max(1, repeats))]
        verdict = runs[0]
        if verdict not in VERDICTS:
            raise ValueError(f"{case['id']}: classifier returned {verdict!r}, not one of {VERDICTS}")
        confusion[(case["expected"], verdict)] += 1
        per_case.append({
            "id": case["id"], "expected": case["expected"], "verdict": verdict,
            "correct": verdict == case["expected"],
            "confident_error": verdict not in ("unknown", case["expected"]),
            "stable": len(set(runs)) == 1,
        })

    n = len(per_case)
    decided = [c for c in per_case if c["verdict"] != "unknown"]
    correct = sum(1 for c in per_case if c["correct"])
    return {
        "cases": n,
        "accuracy": round(correct / n, 3),
        "coverage": round(len(decided) / n, 3),
        "precision": round(correct / len(decided), 3) if decided else 0.0,
        "confident_errors": sum(1 for c in per_case if c["confident_error"]),
        "repeatable": all(c["stable"] for c in per_case),
        "confusion": [{"expected": e, "verdict": v, "count": k} for (e, v), k in sorted(confusion.items())],
        "per_case": per_case,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--repeats", type=int, default=3, help="Passes per case for the repeatability check.")
    parser.add_argument("--max-confident-errors", type=int, default=None)
    parser.add_argument("--min-coverage", type=float, default=None)
    parser.add_argument("--output", type=Path, default=None, help="Write the full JSON report here.")
    args = parser.parse_args(argv)

    report = evaluate(json.loads(args.dataset.read_text()), heuristic_classifier, repeats=args.repeats)
    print(f"cases={report['cases']} accuracy={report['accuracy']:.3f} coverage={report['coverage']:.3f} "
          f"precision={report['precision']:.3f} confident_errors={report['confident_errors']} "
          f"repeatable={report['repeatable']}")
    for c in report["per_case"]:
        if not c["correct"]:
            kind = "WRONG" if c["confident_error"] else "abstain"
            print(f"  {kind:<8} {c['id']}: expected {c['expected']}, got {c['verdict']}")

    failed = not report["repeatable"]
    if args.max_confident_errors is not None and report["confident_errors"] > args.max_confident_errors:
        print(f"  confident_errors above --max-confident-errors {args.max_confident_errors}")
        failed = True
    if args.min_coverage is not None and report["coverage"] < args.min_coverage:
        print(f"  coverage below --min-coverage {args.min_coverage}")
        failed = True

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
