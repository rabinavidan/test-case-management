"""Command-line entrypoint for the Test Plan Reviewer agent.

Usage:
    python -m agents.cli --feature "User login with username and password"
    python -m agents.cli --feature "Login flow" --existing existing_cases.json --model qwen2.5:0.5b

`--existing` is a JSON file: a list of test case dicts (at minimum
`title`/`description`), e.g. what
GET /api/suites/{id}/testcases already returns. Defaults to an empty list
(review from scratch).

Requires a local Ollama server (https://ollama.com) with the target model
already pulled. See agents/README.md.
"""
import argparse
import json
import sys
from pathlib import Path

from agents.test_plan_reviewer import DEFAULT_MODEL, PlanReviewError, review_and_fill_gaps


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Review test cases for coverage gaps and draft cases to fill them.")
    parser.add_argument("--feature", required=True, help="Feature description to review test coverage for.")
    parser.add_argument("--existing", type=Path, default=None, help="JSON file: a list of existing test case dicts.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model name (default: %(default)s).")
    parser.add_argument("--host", default=None, help="Ollama server URL (default: http://localhost:11434).")
    parser.add_argument("--output", type=Path, default=None, help="Write the JSON result to this path.")
    args = parser.parse_args(argv)

    existing_test_cases = json.loads(args.existing.read_text()) if args.existing else []

    try:
        result = review_and_fill_gaps(args.feature, existing_test_cases, model=args.model, host=args.host)
    except PlanReviewError as exc:
        print(f"Test Plan Reviewer failed: {exc}", file=sys.stderr)
        return 1

    output_text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text)
    print(output_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
