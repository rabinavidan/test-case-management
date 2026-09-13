"""Command-line entrypoint for the eval harness.

Usage:
    python -m evals.cli
    python -m evals.cli --target triage --model qwen2.5:0.5b --runs 8 --gate
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
from evals.targets import TARGETS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run an eval harness target against a local Ollama model.")
    parser.add_argument("--target", choices=sorted(TARGETS), default="test_generation", help="Which feature to evaluate.")
    parser.add_argument("--dataset", type=Path, default=None, help="Defaults to the target's own dataset.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model name (default: %(default)s).")
    parser.add_argument("--host", default=None, help="Ollama server URL (default: http://localhost:11434).")
    parser.add_argument("--runs", type=int, default=5, help="Runs per case (default: %(default)s).")
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--output", type=Path, default=None, help="Write the JSON report to this path.")
    parser.add_argument(
        "--gate", action="store_true",
        help="Exit non-zero if any case falls below the target's quality/consistency thresholds (for CI).",
    )
    args = parser.parse_args(argv)

    target_module = TARGETS[args.target]
    dataset = args.dataset or Path(target_module.DEFAULT_DATASET)

    client = OllamaClient(host=args.host, model=args.model)
    report = run_suite(dataset, client, target_module.TARGET, n_runs=args.runs, temperature=args.temperature)

    result = report.to_dict()
    result["target"] = args.target
    result["model"] = args.model

    output_text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text)
    print(output_text)

    if args.gate and not report.overall_pass(
        target_module.DEFAULT_MIN_THRESHOLDS,
        target_module.DEFAULT_MAX_THRESHOLDS,
        target_module.DEFAULT_MAX_ERROR_RATE,
    ):
        print(f"EVAL GATE FAILED ({args.target}): one or more cases fell below quality/consistency thresholds.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
