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
# A case's mean over N runs moves by up to 1/N when a single run changes,
# so a band narrower than that turns one unlucky sample into a "regression".
# With qwen2.5:0.5b at 5 runs and baselines that happened to record stdev 0,
# that is exactly what failed every eval-harness run from 2026-09-17 on: a
# different case each time, always by one or two runs, on unchanged prompts
# (largest swing seen across 10 CI runs: 2 of 5). The floor is therefore
# RUN_SWING runs' worth of movement; a real regression - a broken prompt -
# moves more runs than that, or many cases at once. MAX_RUN_BAND caps the
# floor for very few runs (two runs' worth of 1 run is the whole range), so
# a collapse is still caught at any N.
RUN_SWING = 2
MAX_RUN_BAND = 0.5

# What actually gates: each metric's mean over every case in the suite.
# Per-case means at 5 runs are too noisy to gate on a small model - the
# same qwen2.5:0.5b case on the same prompt measured 0.6, then 1.0 (a
# re-recorded baseline), then 0.4 an hour later. The suite mean averages
# 15 cases x 5 runs: three recordings of test_generation moved it at most
# 0.17 (schema_score 0.59 / 0.76 / 0.68), roughly 3 sigma of the ~0.06
# expected for 75 samples. A real regression - a broken prompt or parser -
# moves every case at once and the suite mean with it, so SUITE_BAND
# (~3.5 sigma) keeps noise out without hiding a regression. Per-case
# drift is still reported by check_regressions(), as a warning.
SUITE_BAND = 0.20


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
            band = max(base_stdev * NOISE_MULTIPLIER, MIN_BAND, _run_swing(len(case.runs)))
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


def _suite_means(cases, key) -> dict:
    """{metric: mean over cases} for the given per-case accessor."""
    per_metric: dict = {}
    for case in cases:
        for metric, value in key(case).items():
            per_metric.setdefault(metric, []).append(value)
    return {m: sum(v) / len(v) for m, v in per_metric.items()}


def check_suite_regressions(report, baseline: dict, min_thresholds: dict, max_thresholds: dict,
                            band: float = SUITE_BAND) -> list[str]:
    """The gating check: for each gated metric, the mean over every case
    present in both the run and the baseline, against the baseline's mean
    over the same cases. Direction comes from the target's thresholds, as in
    check_regressions()."""
    baseline_cases = {c["case_id"]: c for c in baseline.get("cases", [])}
    shared = [c for c in report.cases if c.case_id in baseline_cases]
    if not shared:
        return []
    current = _suite_means(shared, lambda c: c.mean_scores)
    recorded = _suite_means([baseline_cases[c.case_id] for c in shared], lambda c: c["mean_scores"])
    findings = []
    for metric, now in current.items():
        base = recorded.get(metric)
        if base is None:
            continue
        # 1e-9: a drift of exactly `band` must not fail on float rounding.
        if metric in min_thresholds and now < base - band - 1e-9:
            findings.append(f"suite mean {metric}: {now:.3f} fell below baseline {base:.3f} "
                            f"(band ±{band:.2f}, {len(shared)} cases)")
        elif metric in max_thresholds and now > base + band + 1e-9:
            findings.append(f"suite mean {metric}: {now:.3f} rose above baseline {base:.3f} "
                            f"(band ±{band:.2f}, {len(shared)} cases)")
    return findings


def _run_swing(n_runs: int) -> float:
    # +1e-9: a swing of exactly RUN_SWING runs (1.0 -> 0.6) must not fail on float rounding.
    return min(RUN_SWING / n_runs, MAX_RUN_BAND) + 1e-9 if n_runs else 0.0


def check_error_rates(report, baseline: dict, max_error_rate: float, band: float = SUITE_BAND) -> list[str]:
    """Suite-level error rate (runs whose output couldn't be parsed/scored,
    averaged over cases) against the baseline's own suite error rate. The
    fixed max_error_rate stays the floor, but a model whose recorded
    baseline already errs on a third of its runs isn't failed for doing the
    same again - only for getting worse by more than the suite band."""
    baseline_cases = {c["case_id"]: c for c in baseline.get("cases", [])}
    shared = [c for c in report.cases if c.case_id in baseline_cases]
    if not shared:
        return []
    now = sum(c.error_rate for c in shared) / len(shared)
    base = sum(baseline_cases[c.case_id].get("error_rate", 0.0) for c in shared) / len(shared)
    limit = max(max_error_rate, base + band)
    if now > limit + 1e-9:
        return [f"suite error rate {now:.0%} > {limit:.0%} (baseline {base:.0%}, {len(shared)} cases)"]
    return []


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
