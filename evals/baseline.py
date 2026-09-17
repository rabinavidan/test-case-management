"""Per-model, per-target baseline reports and regression gating against them.

evals/cli.py's --gate originally compared every case's mean score to a fixed
absolute threshold sized for "the harness/prompt/scorer wiring isn't badly
broken" - never calibrated to how noisy a *specific* model actually is (see
evals/README.md's original CI-noise example: schema_score mean 0.5, stdev 0.5
across 2 runs on a tiny CPU model). Once a baseline exists for a given
(model, target) pair - a real recorded report from an earlier run - --gate
switches to comparing the current run against that baseline plus a noise
band derived from the *baseline's own* run-to-run consistency
(consistency_stdev), so a seeded prompt regression fails the job while the
model's ordinary variance does not.

A baseline is a plain JSON file checked into the repo
(evals/baselines/<model>/<target>.json) - not a database, not an opaque
artifact - so refreshing it is a reviewable diff like any other change.
"""
import json
import re
from pathlib import Path

BASELINE_DIR = Path("evals/baselines")

# How many baseline standard deviations of slack a current run gets before
# it's flagged as a regression, plus an absolute floor so a baseline that
# happened to record ~0 stdev doesn't become a zero-tolerance gate.
NOISE_MULTIPLIER = 2.0
MIN_BAND = 0.05


def sanitize_model_name(model: str) -> str:
    """Filesystem-safe directory name for a model tag like 'qwen2.5:0.5b'."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", model)


def baseline_path(model: str, target: str) -> Path:
    return BASELINE_DIR / sanitize_model_name(model) / f"{target}.json"


def build_baseline(
    report, model: str, target: str, prompt_id: str | None = None, prompt_version: str | None = None,
) -> dict:
    result = report.to_dict()
    result["model"] = model
    result["target"] = target
    # Course milestone M7 (see evals/prompt_versions.py): which prompt text
    # produced this baseline, recorded alongside it - both None for a target
    # that hasn't opted into prompt versioning.
    result["prompt_id"] = prompt_id
    result["prompt_version"] = prompt_version
    return result


def write_baseline(
    report, model: str, target: str, prompt_id: str | None = None, prompt_version: str | None = None,
) -> Path:
    path = baseline_path(model, target)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(build_baseline(report, model, target, prompt_id, prompt_version), indent=2) + "\n")
    return path


def load_baseline(model: str, target: str) -> dict | None:
    path = baseline_path(model, target)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def check_regressions(report, baseline: dict, min_thresholds: dict, max_thresholds: dict) -> list[str]:
    """Returns a list of human-readable regression descriptions - empty if
    every case's current mean score for every gated metric stays within its
    baseline's noise band.

    min_thresholds/max_thresholds are the same per-target dicts already used
    by the fixed-threshold gate (see evals/targets/*.py) - reused here only
    to decide *direction* per metric, not as the pass/fail boundary itself:
    a metric with a min threshold regresses on a *decrease* beyond the band
    (e.g. schema_score), a metric with a max threshold regresses on an
    *increase* beyond the band (e.g. verbatim_echo_rate). A metric gated by
    neither dict (e.g. duplicate_rate) isn't checked here, same as today's
    fixed-threshold gate. A case or metric missing from the baseline isn't
    gated either - there's nothing recorded to regress against yet.
    """
    baseline_cases = {c["case_id"]: c for c in baseline.get("cases", [])}
    findings = []
    for case in report.cases:
        base_case = baseline_cases.get(case.case_id)
        if not base_case:
            continue
        for metric, current in case.mean_scores.items():
            base_mean = base_case["mean_scores"].get(metric)
            if base_mean is None:
                continue
            base_stdev = base_case["consistency_stdev"].get(metric, 0.0)
            band = max(base_stdev * NOISE_MULTIPLIER, MIN_BAND)
            if metric in min_thresholds and current < base_mean - band:
                findings.append(
                    f"{case.case_id}.{metric}: {current:.3f} fell below baseline "
                    f"{base_mean:.3f} (band ±{band:.3f})"
                )
            elif metric in max_thresholds and current > base_mean + band:
                findings.append(
                    f"{case.case_id}.{metric}: {current:.3f} rose above baseline "
                    f"{base_mean:.3f} (band ±{band:.3f})"
                )
    return findings


def compute_prompt_delta(
    report, baseline: dict, current_prompt_id: str | None, current_prompt_version: str | None,
) -> dict:
    """Per-case, per-metric mean-score delta (current - baseline), plus
    whether the prompt that produced `report` differs from the one that
    produced `baseline` (course milestone M7) - the "a prompt change shows
    its eval delta against the previous version" this milestone exists to
    satisfy. `prompt_changed` is None (not True/False) when the baseline
    predates prompt versioning (no prompt_version recorded) - there's
    nothing to compare a version against, though the numeric deltas below
    are still meaningful either way.
    """
    baseline_prompt_version = baseline.get("prompt_version")
    prompt_changed = None if baseline_prompt_version is None else baseline_prompt_version != current_prompt_version

    baseline_cases = {c["case_id"]: c for c in baseline.get("cases", [])}
    per_case = {}
    for case in report.cases:
        base_case = baseline_cases.get(case.case_id)
        if not base_case:
            continue
        deltas = {}
        for metric, current in case.mean_scores.items():
            base_mean = base_case["mean_scores"].get(metric)
            if base_mean is None:
                continue
            deltas[metric] = current - base_mean
        per_case[case.case_id] = deltas

    return {
        "prompt_id": current_prompt_id,
        "baseline_prompt_version": baseline_prompt_version,
        "current_prompt_version": current_prompt_version,
        "prompt_changed": prompt_changed,
        "per_case_delta": per_case,
    }
