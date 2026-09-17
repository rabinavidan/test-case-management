# AI Eval Harness

An evaluation harness for this repo's non-deterministic AI features. It
now covers two targets:

- **AI Test Generation** (`POST /api/suites/{id}/testcases/generate`)
- **AI Failure Triage** (`POST /api/runs/{id}/triage`)

It exists because neither feature had anything measuring output quality or
run-to-run consistency — they were tested for *control flow* (does a
missing API key 503, does bad JSON 502 — see `tests/api/test_ai_generate.py`)
but never for *whether the model's actual output is any good*, or how much
that varies between two calls with the same prompt.

## Why this is a harder problem than a normal test suite

A normal test asserts `f(x) == y`. An LLM call is not a pure function: the
same prompt run twice can produce different (both individually reasonable)
outputs. So this harness runs each dataset case **N times** (default 5) and
reports two different things, not one:

- **mean_scores** — average quality per metric across the N runs.
- **consistency_stdev** — the population standard deviation of each metric
  across those same runs. A prompt that scores 1.0 on one run and 0.4 on
  the next has a real reliability problem that a single run, or an average,
  would hide.

This isn't hypothetical — running the harness against a real 0.5B-parameter
local model surfaces exactly this: `schema_score` on the `login-flow` case
came back as mean 0.5, stdev 0.5 across 2 runs (one run's JSON was
schema-valid, the other wasn't). A harness that only ran the prompt once
could have gotten either result and reported it as "the" answer.

## Design choices

- **Target-agnostic harness, feature-specific targets** (`evals/harness.py`'s
  `EvalTarget`) — the orchestration (run N times, aggregate mean +
  consistency, gate against thresholds) is identical for both features;
  what differs is how to build the prompt and how to score a response.
  Each feature's specifics live in `evals/targets/{test_generation,triage}.py`,
  registered in `evals/targets/__init__.py`. Adding a third AI feature means
  adding one target module, not touching the harness.
- **Deterministic scorers as the primary axis** (`evals/scorers.py` for test
  generation, `evals/triage_scorers.py` for triage) — schema validity,
  keyword coverage, a duplicate-title rate, sentence-count-in-range, and a
  "did the model just paste the input back" check. A scorer that itself
  calls a model adds its own non-determinism on top of the thing being
  measured, so these stay plain and auditable — nothing here changed to
  accommodate the optional LLM-as-judge axis (see "Optional LLM-as-judge
  scoring" below), which runs alongside them, never instead.
- **Ollama as the model backend** (`evals/ollama_client.py`) — a local
  model with no API key and no per-call cost is what makes running each
  case 5+ times, repeatedly, in CI or locally, practical. A plain `httpx`
  call against Ollama's `/api/chat` endpoint, matching this repo's existing
  pattern of calling a model's HTTP API directly rather than adding an SDK
  dependency for one endpoint (see `scripts/coverage_gap_agent.py`'s Gemini
  client).
- **The exact production prompts, not copies of them** — `api/ai_prompts.py`
  was extracted out of `api/main.py`'s `generate_testcases` and `triage_run`
  endpoints so both the live API and this harness import the same prompt
  constants and builder functions. Duplicating a prompt string into the
  harness would risk silently evaluating something other than what
  production actually sends.
- **A run that errors scores as a failure, not an exclusion**
  (each target's `error_scores`) — an eval harness that drops failed runs
  from its average would hide exactly the flakiness it exists to surface.

## Usage

Requires a local [Ollama](https://ollama.com) server with the target model
pulled:

```bash
ollama pull llama3.1
python -m evals.cli --target test_generation --model llama3.1 --runs 5
python -m evals.cli --target triage --model llama3.1 --runs 5
```

Write a JSON report and fail (non-zero exit) if any case falls below that
target's quality/consistency thresholds (see `evals/targets/*.py`):

```bash
python -m evals.cli --target triage --output evals/reports/triage.json --gate
```

Run against a different dataset or model:

```bash
python -m evals.cli --target test_generation --dataset evals/datasets/test_generation.json --model qwen2.5:7b --runs 8
```

Score each run with an LLM judge too, alongside the deterministic scorers
(see "Optional LLM-as-judge scoring" below):

```bash
python -m evals.cli --target test_generation --model qwen2.5:0.5b --judge-model qwen2.5:1.5b --runs 5
```

## Running in CI

`.github/workflows/eval-harness.yml` installs Ollama, pulls a small CPU
model (`qwen2.5:0.5b`, ~400MB), and runs both targets for real — not just
the mocked unit tests below — writing a per-case job summary. It only
triggers on changes to `api/ai_prompts.py` or `evals/**`, since it downloads
a model and makes several LLM calls per case.

Once a baseline is recorded for the model this job runs (`qwen2.5:0.5b` —
see "Baseline regression gating" below), `--gate` compares against it and
this job's exit code is real: a seeded prompt regression fails it, ordinary
model noise doesn't. `eval-harness.yml` still isn't a *required* status
check, so a red run here never blocks a merge on its own — it's a genuine
signal to go look, not a false alarm to ignore.

## Baseline regression gating

`evals/baseline.py` and `--gate`/`--record-baseline` in `evals/cli.py`
replace a fixed absolute quality threshold with a per-model, per-target
baseline once one has been recorded:

- **Recording**: `python -m evals.cli --target test_generation --model
  qwen2.5:0.5b --runs 5 --record-baseline` runs the suite for real and
  writes `evals/baselines/<sanitized model>/<target>.json` — the exact
  `SuiteReport.to_dict()` shape (per-case `mean_scores` and
  `consistency_stdev`) plus the model and target. It's a plain JSON file
  checked into the repo, so refreshing it is an ordinary, reviewable diff,
  not an opaque artifact or a database row.
- **Gating**: once a baseline exists for a `(model, target)` pair, `--gate`
  compares the current run's mean score, per case and per gated metric,
  against `baseline_mean ± noise_band`, where `noise_band = max(2 ×
  baseline_stdev, 0.05)`. The 2× multiplier and 0.05 floor are deliberately
  generous — the baseline's own recorded variance sets most of the band, but
  a baseline that happened to record ~0 stdev by chance doesn't become a
  zero-tolerance gate. Which metrics are gated, and in which direction, is
  read straight from the target's existing `DEFAULT_MIN_THRESHOLDS` /
  `DEFAULT_MAX_THRESHOLDS` (see `evals/targets/*.py`) — a min-thresholded
  metric (e.g. `schema_score`) regresses on a *drop* below the band, a
  max-thresholded one (e.g. `verbatim_echo_rate`) regresses on a *rise*
  above it. No baseline recorded yet for a `(model, target)` pair → `--gate`
  falls back to the original fixed-threshold check.
- **Refreshing deliberately**: `eval-harness.yml`'s `workflow_dispatch` takes
  a `record_baseline` boolean input. Triggered with it set, the job runs
  `--record-baseline` for both targets against the real CI runner (not a
  developer's own machine, which may have different noise characteristics)
  and commits the result straight to whatever ref it was dispatched on — one
  command, and the outcome is a normal commit a human reviews like any
  other, whether that's on a feature branch before merging or directly on
  `main` when a maintainer means to update the baseline right away.

The committed `qwen2.5:0.5b` baselines in this repo were recorded from a
real run against the actual model (not fabricated), but from a sandbox
machine rather than an actual GitHub Actions runner — noise characteristics
can differ. Re-running the `record_baseline` dispatch once on the real CI
runner supersedes it with a baseline measured in the same environment
`--gate` actually runs in.

## Optional LLM-as-judge scoring

`evals/llm_judge.py` adds a second, optional scoring axis for a qualitative
dimension the deterministic scorers structurally can't reach — schema
validity, keyword coverage, and a duplicate-title rate can confirm a test
case is well-*formed*; none of them can judge whether it's actually a
*good* test case (specific, testable, covering a genuinely distinct
scenario), and the same gap exists on the triage side between "is this
free text non-empty and the right length" and "does it actually name a
plausible root cause." An LLM judge can reach that gap; a deterministic
check cannot.

- **Off by default, on with `--judge-model`.** No `--judge-model` flag →
  the judge never runs, `judge_model` is `null` in the report, and every
  case's `judge_mean`/`judge_consistency_stdev` are `null` too — not 0.0,
  which would look like a real, bad score. This is the same graceful-skip
  convention the rest of this repo's AI-feature code already uses for a
  missing API key.
- **Alongside, never instead of, the deterministic scorers.** The judge
  score is never folded into `mean_scores`/`consistency_stdev` and is
  never gated by `--gate` — it's reported as its own separate `judge_mean`/
  `judge_consistency_stdev` pair per case, exactly the "report both axes
  separately" the deterministic scorers were built to keep auditable
  (see `evals/scorers.py`'s original design note). `--gate`/baseline
  regression checking are entirely unaffected by whether a judge was
  configured.
- **A fixed rubric, per feature.** `JUDGE_RUBRIC_TEST_GENERATION` and
  `JUDGE_RUBRIC_TRIAGE` are plain-text criteria the judge model is asked to
  rate against on a 0.0-1.0 scale, returned as `{"score": ..., "reasoning":
  ...}` JSON. The rubric text is fixed in this module, not built per case,
  so the yardstick is the same across every case in a run.
- **Pinned and recorded, not just passed on the command line.** The judge
  model name is written into `result["judge_model"]` in every report — the
  same "auditable yardstick" reasoning as `evals/baseline.py` recording
  `model`/`target` on every baseline. An Ollama tag (e.g. `qwen2.5:1.5b`)
  is itself an immutable version pin, the same way a baseline's committed
  model directory name is.
- **A judge-call failure degrades to "no judge score for this run," never
  to a failed run.** The judge call happens only after the deterministic
  score for that run already succeeded, and any exception during the judge
  call itself (unreachable server, a judge response that isn't valid
  `{"score": ...}` JSON) is caught in `evals/harness.py` and recorded as
  `judge_score = None` for that one run — it doesn't touch `error_rate` or
  fail the case.

## Layout

| File | Purpose |
|------|---------|
| `evals/ollama_client.py` | Thin HTTP client for a local Ollama server. |
| `evals/harness.py` | Target-agnostic orchestration: runs a dataset N times per case; aggregates mean + consistency; gates on thresholds. |
| `evals/scorers.py` | Deterministic scorers for AI Test Generation's JSON output. |
| `evals/triage_scorers.py` | Deterministic scorers for AI Failure Triage's free-text output. |
| `evals/targets/test_generation.py`, `evals/targets/triage.py` | Per-feature prompt-building + scoring, wired into an `EvalTarget`. |
| `evals/baseline.py` | Per-model, per-target baseline recording and noise-band regression checking (see "Baseline regression gating"). |
| `evals/baselines/` | Committed baseline reports, one JSON file per `(model, target)` pair. |
| `evals/llm_judge.py` | Optional LLM-as-judge rubric, prompt-building, and response parsing (see "Optional LLM-as-judge scoring"). |
| `evals/cli.py` | `python -m evals.cli --target {test_generation,triage}` entrypoint, with a CI-friendly `--gate` exit code, `--record-baseline`, and `--judge-model`. |
| `evals/datasets/test_generation.json`, `evals/datasets/triage.json` | Golden datasets: inputs + required keywords per case. |
| `.github/workflows/eval-harness.yml` | Runs both targets against a real local model in CI; gates against a committed baseline where one exists. |

Unit tests (`tests/unit/test_evals_*.py`, `tests/unit/test_ai_prompts.py`)
mock every Ollama HTTP call — none of them require a real Ollama server,
matching how the rest of this repo's AI-feature tests never hit a real
Anthropic/Gemini API either.

## Golden datasets: how a case is chosen and labelled

Both datasets now hold 15 cases each. A golden set of one or two cases (the
original size) cannot tell a real prompt regression apart from noise — 15+
gives the mean/stdev the harness computes something real to measure across.

Every case carries a `category` field (metadata only — no scorer reads it,
it's there so a human picking cases can see the mix at a glance):

- **`easy`** — a single, unambiguous feature with clear required keywords.
  These exist to catch a gross regression (the harness/prompt/scorer wiring
  itself breaking), not to stress the model.
- **`edge`** — a boundary condition inside an otherwise normal feature: a
  zero-result count, an out-of-range page, an unrecognised input value.
  Cheap deterministic scorers like `count_match_score` and
  `keyword_coverage_score` are specifically weak at rewarding a model for
  *handling* an edge case rather than ignoring it, so these cases matter
  even though the scorers can't fully judge quality here (a `llm_judge`
  scorer — see Future work — is the planned way to close that gap).
- **`known_hard`** — a feature this repo's own code shows really is harder:
  multi-step flows (WebSocket reconnect + resync), cross-cutting concerns
  (RBAC across every write action), or another async system in the loop
  (Kafka producer/consumer, an upstream AI API call). These are the cases
  most likely to reveal a genuine prompt weakness, not just noise.
- **`adversarial`** — deliberately shaped to tempt a weak model into the
  specific failure modes `duplicate_rate` and `keyword_coverage_score`
  exist to catch: a feature description listing many near-identical
  sub-scenarios (bait for repeated titles), or one whose required vocabulary
  isn't stated outright and has to be inferred rather than copied from the
  prompt.

Each case's `required_keywords` are chosen to be genuinely implied by its
`feature_description` (test generation) or `problem_results` (triage) — not
padding. `count` (test generation) is kept to 3-5 so a single scripted test
double in `tests/unit/test_evals_cli.py` can score every case consistently
without special-casing.

## Future work

- Wire `--judge-model` into `eval-harness.yml` so CI reports a judge score
  alongside the deterministic ones on every run, not just locally — held
  back for now because it roughly doubles the job's LLM-call count (a
  judge call per run, on top of the run itself) and CI job duration on an
  already-slow CPU runner.
- A larger model in CI (traded off against job duration) if `qwen2.5:0.5b`'s
  variance turns out to be dominated by model size rather than genuine
  prompt sensitivity.
