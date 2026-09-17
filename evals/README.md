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
- **Deterministic scorers only** (`evals/scorers.py` for test generation,
  `evals/triage_scorers.py` for triage) — schema validity, keyword coverage,
  a duplicate-title rate, sentence-count-in-range, and a "did the model just
  paste the input back" check. No LLM-as-judge in this first pass: a scorer
  that itself calls a model would add its own non-determinism on top of the
  thing being measured, and a plain, auditable check is easier to trust when
  tuning thresholds. (LLM-as-judge is a reasonable next step — see Future
  work.)
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

## Running in CI

`.github/workflows/eval-harness.yml` installs Ollama, pulls a small CPU
model (`qwen2.5:0.5b`, ~400MB), and runs both targets for real — not just
the mocked unit tests below — writing a per-case job summary. It only
triggers on changes to `api/ai_prompts.py` or `evals/**`, since it downloads
a model and makes several LLM calls per case.

It's **informational, not a blocking gate**: `--gate`'s exit code is
recorded but doesn't fail the job. A 0.5B CPU model's output varies enough
run to run (see the "Why this is a harder problem" example above) that
failing the build on it would be noise, not signal — a hard gate wants a
calibrated per-model baseline first (see Future work).

## Layout

| File | Purpose |
|------|---------|
| `evals/ollama_client.py` | Thin HTTP client for a local Ollama server. |
| `evals/harness.py` | Target-agnostic orchestration: runs a dataset N times per case; aggregates mean + consistency; gates on thresholds. |
| `evals/scorers.py` | Deterministic scorers for AI Test Generation's JSON output. |
| `evals/triage_scorers.py` | Deterministic scorers for AI Failure Triage's free-text output. |
| `evals/targets/test_generation.py`, `evals/targets/triage.py` | Per-feature prompt-building + scoring, wired into an `EvalTarget`. |
| `evals/cli.py` | `python -m evals.cli --target {test_generation,triage}` entrypoint, with a CI-friendly `--gate` exit code. |
| `evals/datasets/test_generation.json`, `evals/datasets/triage.json` | Golden datasets: inputs + required keywords per case. |
| `.github/workflows/eval-harness.yml` | Runs both targets against a real local model in CI (informational). |

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

- A stored per-model baseline report and a real regression check (fail the
  build if a push measurably regresses a case relative to its baseline),
  replacing today's informational-only CI run.
- An optional LLM-as-judge scorer for qualitative dimensions a deterministic
  check can't reach (e.g. "is this test case actually testable as written"),
  clearly separated from the deterministic scores above.
- A larger model in CI (traded off against job duration) if `qwen2.5:0.5b`'s
  variance turns out to be dominated by model size rather than genuine
  prompt sensitivity.
