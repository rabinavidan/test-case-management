"""Export human reviews of AI drafts into an eval dataset (course milestone M9).

The review step in the UI records a verdict on every generated test case
(accepted / edited / rejected-with-reason). This turns them into data the eval
harness can run, closing the loop docs/ai-roadmap.md describes:
human judgement -> eval dataset -> prompt change -> regression check.

- A rejection that names what the draft should have covered (`must_cover`)
  becomes a `test_generation` eval case whose `required_keywords` are those
  keywords: it fails on the output the reviewer rejected, and passes once a
  prompt change makes the model cover them.
- A rejection without `must_cover` can't be scored deterministically yet, so
  it is listed under `unscored_rejections` for a person to turn into a case.
- Edits are kept as (model output -> human version) pairs under `human_edits`.

Reads reviews over the API, so it works against any deployment:

    python -m evals.export_reviews --base-url http://localhost:8000 --token $TOKEN
    python -m evals.cli --target test_generation --dataset evals/datasets/human_reviews.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

DEFAULT_OUTPUT = Path(__file__).parent / "datasets" / "human_reviews.json"


def reviews_to_dataset(reviews: list[dict]) -> dict:
    cases, unscored, edits = [], [], []
    for r in sorted(reviews, key=lambda r: r["id"]):
        provenance = {
            "review_id": r["id"], "model": r.get("model"), "reviewer": r.get("reviewer"),
            "reviewed_at": r.get("created_at"),
        }
        if r["verdict"] == "rejected":
            entry = {**provenance, "reason": r.get("reason"), "rejected_output": r["output"]}
            if r.get("must_cover"):
                cases.append({
                    "id": f"human-review-{r['id']}",
                    "category": "human_review",
                    "suite_name": r.get("suite_name") or "Suite",
                    "feature_description": r["feature_description"],
                    "count": r.get("batch_size") or 1,
                    "required_keywords": r["must_cover"],
                    "human_review": entry,
                })
            else:
                unscored.append({**entry, "feature_description": r["feature_description"]})
        elif r["verdict"] == "edited":
            edits.append({**provenance, "feature_description": r["feature_description"],
                          "model_output": r["output"], "human_version": r["edited"]})
    return {
        "description": "Eval cases from human reviews of AI-generated test cases (M9), "
                       "exported by evals/export_reviews.py. Each case's required_keywords are what "
                       "the reviewer said a rejected draft should have covered.",
        "cases": cases,
        "unscored_rejections": unscored,
        "human_edits": edits,
    }


def fetch_reviews(base_url: str, token: str) -> list[dict]:
    res = httpx.get(f"{base_url.rstrip('/')}/api/ai/reviews",
                    headers={"Authorization": f"Bearer {token}"}, timeout=30)
    res.raise_for_status()
    return res.json()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default=os.getenv("TESTFLOW_URL", "http://localhost:8000"))
    parser.add_argument("--token", default=os.getenv("TESTFLOW_TOKEN"), help="An admin's bearer token (or TESTFLOW_TOKEN).")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    if not args.token:
        parser.error("an admin token is required (--token or TESTFLOW_TOKEN)")

    dataset = reviews_to_dataset(fetch_reviews(args.base_url, args.token))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(dataset['cases'])} eval cases, {len(dataset['unscored_rejections'])} unscored rejections, "
          f"{len(dataset['human_edits'])} edits -> {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
