"""Evaluation harness orchestration — target-agnostic.

Runs each case in a dataset against a model client N times (default 5) and
aggregates scores two ways:
  - mean_scores        — average quality per metric, the usual "how good"
  - consistency_stdev  — standard deviation per metric across the N runs,
                          i.e. how much a *non-deterministic* model's output
                          quality swings run to run for the same prompt.

A harness that only ran each prompt once could get lucky or unlucky and
never tell the difference; running N times and reporting the spread is the
point of this module.

What varies between features (AI Test Generation vs. AI Failure Triage) is
the prompt to build and how to score a response — that's captured in an
EvalTarget (see evals/targets/) so this module stays the same for both.
"""
import json
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from evals.llm_judge import parse_judge_score
from evals.ollama_client import OllamaClient

DEFAULT_RUNS_PER_CASE = 5


@dataclass(frozen=True)
class EvalTarget:
    """The feature-specific half of an eval run.

    build_prompt(case) -> (system_prompt, user_prompt)
    score(raw_response, case) -> {metric_name: float, ...} over `metrics`

    error_scores is what a run that raised an exception (unreachable
    Ollama, unparseable response, ...) scores as — a full failure, not an
    exclusion, so a harness run can't hide flakiness by averaging it away.

    build_judge_prompt(case, raw_response) -> (system_prompt, user_prompt),
    optional. Only used when the harness is given a judge_client (see
    run_suite/run_case) — see evals/llm_judge.py. A target with no judge
    prompt builder simply never gets a judge score, same as no judge_client
    being configured at all.

    prompt_id/prompt_version (course milestone M7, see evals/prompt_versions.py)
    identify the target's primary prompt — prompt_id is a stable, hand-picked
    name for it (e.g. "triage_system"), prompt_version a hash of its current
    exact text. Both None for a target that hasn't opted in yet; evals/cli.py
    only records/compares prompt versions when they're set.
    """
    name: str
    metrics: tuple
    error_scores: dict
    build_prompt: Callable[[dict], tuple]
    score: Callable[[str, dict], dict]
    build_judge_prompt: Callable[[dict, str], tuple] | None = None
    prompt_id: str | None = None
    prompt_version: str | None = None


@dataclass
class RunResult:
    scores: dict
    error: str | None = None
    # None means "no judge configured for this run" or "the judge call
    # itself failed" - both degrade the same way, per evals/llm_judge.py.
    judge_score: float | None = None


@dataclass
class CaseReport:
    case_id: str
    metrics: tuple
    runs: list = field(default_factory=list)

    @property
    def mean_scores(self) -> dict:
        if not self.runs:
            return {m: 0.0 for m in self.metrics}
        return {m: statistics.mean(r.scores[m] for r in self.runs) for m in self.metrics}

    @property
    def consistency_stdev(self) -> dict:
        """Population stdev per metric across all runs (errored runs
        included, per EvalTarget.error_scores). Needs at least 2 runs;
        reports 0.0 for fewer, which means "not measured", not "perfectly
        consistent"."""
        if len(self.runs) < 2:
            return {m: 0.0 for m in self.metrics}
        return {m: statistics.pstdev(r.scores[m] for r in self.runs) for m in self.metrics}

    @property
    def error_rate(self) -> float:
        return sum(1 for r in self.runs if r.error) / len(self.runs) if self.runs else 0.0

    @property
    def judge_mean(self) -> float | None:
        """None when no judge score was ever collected for this case (no
        judge configured, or every judge call failed) - distinct from a
        real low score, so a report can't confuse "not measured" with
        "measured and bad"."""
        scores = [r.judge_score for r in self.runs if r.judge_score is not None]
        return statistics.mean(scores) if scores else None

    @property
    def judge_consistency_stdev(self) -> float | None:
        scores = [r.judge_score for r in self.runs if r.judge_score is not None]
        if not scores:
            return None
        return statistics.pstdev(scores) if len(scores) >= 2 else 0.0


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
                    "judge_mean": c.judge_mean,
                    "judge_consistency_stdev": c.judge_consistency_stdev,
                }
                for c in self.cases
            ]
        }

    def overall_pass(self, min_thresholds: dict, max_thresholds: dict, max_error_rate: float) -> bool:
        """True only if every case clears every threshold — one bad case
        should not be averaged away by good ones when this gates CI.
        min_thresholds/max_thresholds are {metric_name: threshold}; a
        metric absent from either dict isn't gated."""
        for case in self.cases:
            means = case.mean_scores
            for metric, threshold in min_thresholds.items():
                if means.get(metric, 0.0) < threshold:
                    return False
            for metric, threshold in max_thresholds.items():
                if means.get(metric, 0.0) > threshold:
                    return False
            if case.error_rate > max_error_rate:
                return False
        return True


def load_dataset(path: Path) -> list:
    return json.loads(Path(path).read_text())["cases"]


def _judge_run(target: EvalTarget, judge_client: OllamaClient, case: dict, raw: str) -> float | None:
    """Best-effort: a judge-call failure (unreachable server, unparseable
    judge response, ...) degrades to "no judge score for this run", the
    same graceful-skip convention as a missing judge model entirely - it
    never fails the deterministic run it's riding alongside."""
    if judge_client is None or target.build_judge_prompt is None:
        return None
    try:
        judge_system, judge_user = target.build_judge_prompt(case, raw)
        judge_raw = judge_client.generate(judge_system, judge_user, temperature=0.0)
        return parse_judge_score(judge_raw)
    except Exception:
        return None


def run_case(
    case: dict,
    client: OllamaClient,
    target: EvalTarget,
    n_runs: int,
    temperature: float,
    judge_client: OllamaClient | None = None,
) -> CaseReport:
    report = CaseReport(case_id=case["id"], metrics=target.metrics)
    system_prompt, user_prompt = target.build_prompt(case)
    for _ in range(n_runs):
        try:
            raw = client.generate(system_prompt, user_prompt, temperature=temperature)
            scores = target.score(raw, case)
            judge_score = _judge_run(target, judge_client, case, raw)
            report.runs.append(RunResult(scores=scores, judge_score=judge_score))
        except Exception as exc:
            # Broad on purpose: a local model's raw text can fail in ways a
            # remote, schema-constrained API rarely does (truncated JSON,
            # prose instead of JSON, an unreachable server). Any of those
            # is itself a finding the harness must record, not propagate.
            report.runs.append(RunResult(scores=dict(target.error_scores), error=str(exc)))
    return report


def run_suite(
    dataset_path: Path,
    client: OllamaClient,
    target: EvalTarget,
    n_runs: int = DEFAULT_RUNS_PER_CASE,
    temperature: float = 0.7,
    judge_client: OllamaClient | None = None,
) -> SuiteReport:
    cases = load_dataset(dataset_path)
    return SuiteReport(cases=[run_case(c, client, target, n_runs, temperature, judge_client) for c in cases])
