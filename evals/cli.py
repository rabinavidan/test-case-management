"""Command-line entrypoint for the AI Test Generation eval harness.

Usage:
    python -m evals.cli
    python -m evals.cli --model qwen2.5:7b --runs 8 --gate
    python -m evals.cli --dataset evals/datasets/test_generation.json --output evals/reports/latest.json

Requires a local Ollama server (https://ollama.com) with the target model
already pulled (`ollama pull llama3.1`). See evals/README.md.
"""
import argparse
import json
import sys
from pathlib import Path

from evals.harness import run_suite
from evals.ollama_client import DEFAULT_MODEL, OllamaClient

DEFAULT_DATASET = Path(__file__).parent / "datasets" / "test_generation.json"

# CI regression gate — deliberately looser than "perfect": this checks the
# harness and prompt haven't regressed, not that a small local model is
# flawless. Tune per-model as real baselines accumulate (see M2).
DEFAULT_THRESHOLDS = {
    "schema_score": 0.9,
    "count_match_score": 0.9,
    "keyword_coverage_score": 0.5,
    "max_error_rate": 0.2,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the AI Test Generation eval harness against a local Ollama model.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="Path to a dataset JSON file.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model name (default: %(default)s).")
    parser.add_argument("--host", default=None, help="Ollama server URL (default: http://localhost:11434).")
    parser.add_argument("--runs", type=int, default=5, help="Runs per case (default: %(default)s).")
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--output", type=Path, default=None, help="Write the JSON report to this path.")
    parser.add_argument(
        "--gate", action="store_true",
        help="Exit non-zero if any case falls below the quality/consistency thresholds (for CI).",
    )
    args = parser.parse_args(argv)

    client = OllamaClient(host=args.host, model=args.model)
    report = run_suite(args.dataset, client, n_runs=args.runs, temperature=args.temperature)
    result = report.to_dict()

    output_text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text)
    print(output_text)

    if args.gate and not report.overall_pass(DEFAULT_THRESHOLDS):
        print("EVAL GATE FAILED: one or more cases fell below quality/consistency thresholds.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
