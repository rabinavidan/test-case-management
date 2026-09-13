"""Evaluation harness orchestration.

Runs each case in a dataset against a model client N times (default 5) and
aggregates scores two ways:
  - mean_scores      — average quality per metric, the usual "how good"
  - consistency_stdev — standard deviation per metric across the N runs,
                         i.e. how much a *non-deterministic* model's output
                         quality swings run to run for the same prompt.

A harness that only ran each prompt once could get lucky or unlucky and
never tell the difference; running N times and reporting the spread is the
point of this module.
"""
import json
import statistics
from dataclasses import dataclass, field
from pathlib import Path

from api.ai_prompts import (
    TESTCASE_GENERATION_SYSTEM_PROMPT,
    build_testcase_generation_user_prompt,
    parse_testcase_generation_response,
)
from evals.ollama_client import OllamaClient
from evals.scorers import aggregate_score

DEFAULT_RUNS_PER_CASE = 5
METRICS = ("schema_score", "count_match_score", "keyword_coverage_score", "duplicate_rate")

# A run that errored (Ollama unreachable, unparseable response, ...) scores
# as a full failure rather than being excluded — an eval harness that drops
# failed runs from the average would hide exactly the flakiness it exists
# to measure.
ERROR_SCORES = {"schema_score": 0.0, "count_match_score": 0.0, "keyword_coverage_score": 0.0, "duplicate_rate": 1.0}


@dataclass
class RunResult:
    scores: dict
    error: str | None = None


@dataclass
class CaseReport:
    case_id: str
    runs: list = field(default_factory=list)

    @property
    def mean_scores(self) -> dict:
        if not self.runs:
            return {m: 0.0 for m in METRICS}
        return {m: statistics.mean(r.scores[m] for r in self.runs) for m in METRICS}

    @property
    def consistency_stdev(self) -> dict:
        """Population stdev per metric across all runs (errored runs
        included, per ERROR_SCORES above). Needs at least 2 runs; reports
        0.0 for fewer, which means "not measured", not "perfectly
        consistent"."""
        if len(self.runs) < 2:
            return {m: 0.0 for m in METRICS}
        return {m: statistics.pstdev(r.scores[m] for r in self.runs) for m in METRICS}

    @property
    def error_rate(self) -> float:
        return sum(1 for r in self.runs if r.error) / len(self.runs) if self.runs else 0.0


@dataclass
class SuiteReport:
    cases: list

    def to_dict(self) -> dict:
        return {
            "cases": [
                {
                    "case_id": c.case_id,
                    "runs": len(c.runs),
                    "mean_scores": c.mean_scores,
                    "consistency_stdev": c.consistency_stdev,
                    "error_rate": c.error_rate,
                }
                for c in self.cases
            ]
        }

    def overall_pass(self, thresholds: dict) -> bool:
        """True only if every case clears every threshold — one bad case
        should not be averaged away by good ones when this gates CI."""
        for case in self.cases:
            means = case.mean_scores
            if means["schema_score"] < thresholds.get("schema_score", 0.9):
                return False
            if means["count_match_score"] < thresholds.get("count_match_score", 0.9):
                return False
            if means["keyword_coverage_score"] < thresholds.get("keyword_coverage_score", 0.5):
                return False
            if case.error_rate > thresholds.get("max_error_rate", 0.2):
                return False
        return True


def load_dataset(path: Path) -> list:
    return json.loads(Path(path).read_text())["cases"]


def run_case(case: dict, client: OllamaClient, n_runs: int, temperature: float) -> CaseReport:
    report = CaseReport(case_id=case["id"])
    user_prompt = build_testcase_generation_user_prompt(
        suite_name=case.get("suite_name", "Suite"),
        feature_description=case["feature_description"],
        count=case["count"],
    )
    for _ in range(n_runs):
        try:
            raw = client.generate(TESTCASE_GENERATION_SYSTEM_PROMPT, user_prompt, temperature=temperature)
            test_cases = parse_testcase_generation_response(raw)
            scores = aggregate_score(test_cases, case["count"], case.get("required_keywords", []))
            report.runs.append(RunResult(scores=scores))
        except Exception as exc:
            # Broad on purpose: a local model's raw text can fail in ways a
            # remote, schema-constrained API rarely does (truncated JSON,
            # prose instead of JSON, an unreachable server). Any of those
            # is itself a finding the harness must record, not propagate.
            report.runs.append(RunResult(scores=dict(ERROR_SCORES), error=str(exc)))
    return report


def run_suite(
    dataset_path: Path,
    client: OllamaClient,
    n_runs: int = DEFAULT_RUNS_PER_CASE,
    temperature: float = 0.7,
) -> SuiteReport:
    cases = load_dataset(dataset_path)
    return SuiteReport(cases=[run_case(c, client, n_runs, temperature) for c in cases])
