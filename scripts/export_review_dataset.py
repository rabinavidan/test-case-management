"""Course milestone M9 — turn in-app human reviews of AI drafts into eval cases.

Fetches GET /api/ai-reviews/export (one case per reviewed generation call:
the prompt inputs, the titles a reviewer kept, and the drafts they rejected
with a reason) and merges it into evals/datasets/test_generation_reviewed.json,
the dataset the test_generation_reviewed eval target runs. Merging is by case
id, so re-running is idempotent: a case is replaced when its generation got
more reviews, never duplicated, and seed cases are left alone.

Usage:
    python scripts/export_review_dataset.py --base-url https://… --token "$TOKEN"
    python scripts/export_review_dataset.py --from-file export.json   # offline / tests
    python -m evals.cli --target test_generation_reviewed --model qwen2.5:0.5b --gate
"""
import argparse
import json
import sys
from pathlib import Path

import httpx

DEFAULT_DATASET = Path("evals/datasets/test_generation_reviewed.json")


def fetch_export(base_url: str, token: str) -> dict:
    res = httpx.get(f"{base_url.rstrip('/')}/api/ai-reviews/export",
                    headers={"Authorization": f"Bearer {token}"}, timeout=30)
    res.raise_for_status()
    return res.json()


def merge_cases(existing: list[dict], exported: list[dict]) -> tuple[list[dict], int, int]:
    """Exported cases replace same-id existing cases in place; new ones are
    appended. Returns (merged, added, updated)."""
    by_id = {c["id"]: c for c in exported}
    merged, updated = [], 0
    for case in existing:
        if case["id"] in by_id:
            replacement = by_id.pop(case["id"])
            updated += replacement != case
            merged.append(replacement)
        else:
            merged.append(case)
    added = [c for c in exported if c["id"] in by_id]
    return merged + added, len(added), updated


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--base-url", help="TestFlow base URL (needs --token of an admin)")
    source.add_argument("--from-file", type=Path, help="A saved GET /api/ai-reviews/export response")
    parser.add_argument("--token", help="Admin bearer token, with --base-url")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    args = parser.parse_args(argv)

    if args.base_url and not args.token:
        parser.error("--base-url needs --token")
    export = (json.loads(args.from_file.read_text()) if args.from_file
              else fetch_export(args.base_url, args.token))

    existing = json.loads(args.dataset.read_text())["cases"] if args.dataset.exists() else []
    merged, added, updated = merge_cases(existing, export.get("cases", []))
    args.dataset.write_text(json.dumps({"cases": merged}, indent=2, ensure_ascii=False) + "\n")
    print(f"{args.dataset}: {added} added, {updated} updated, {len(merged)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
