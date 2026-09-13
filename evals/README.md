# AI Eval Harness

An evaluation harness for this repo's non-deterministic AI features,
starting with **AI Test Generation** (`POST /api/suites/{id}/testcases/generate`,
`api/ai_prompts.py`). It exists because none of this repo's LLM-powered
features had anything measuring output quality or run-to-run consistency —
they were tested for *control flow* (does a missing API key 503, does bad
JSON 502 — see `tests/api/test_ai_generate.py`) but never for *whether the
model's actual output is any good*, or how much that varies between two
calls with the same prompt.

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

## Design choices

- **Deterministic scorers only** (`evals/scorers.py`) — schema validity,
  requested-count match, required-keyword coverage, and a duplicate-title
  rate. No LLM-as-judge in this first pass: a scorer that itself calls a
  model would add its own non-determinism on top of the thing being
  measured, and a plain, auditable check is easier to trust when tuning
  thresholds. (LLM-as-judge is a reasonable next step — see Future work.)
- **Ollama as the model backend** (`evals/ollama_client.py`) — a local
  model with no API key and no per-call cost is what makes running each
  case 5+ times, repeatedly, in CI or locally, practical. A plain `httpx`
  call against Ollama's `/api/chat` endpoint, matching this repo's existing
  pattern of calling a model's HTTP API directly rather than adding an SDK
  dependency for one endpoint (see `scripts/coverage_gap_agent.py`'s Gemini
  client).
- **The exact production prompt, not a copy of it** — `api/ai_prompts.py`
  was extracted out of `api/main.py`'s `generate_testcases` endpoint so both
  the live API and this harness import the same `TESTCASE_GENERATION_SYSTEM_PROMPT`
  and `build_testcase_generation_user_prompt`. Duplicating the prompt string
  into the harness would risk silently evaluating something other than what
  production actually sends.
- **A run that errors scores as a failure, not an exclusion**
  (`evals/harness.py`'s `ERROR_SCORES`) — an eval harness that drops failed
  runs from its average would hide exactly the flakiness it exists to
  surface.

## Usage

Requires a local [Ollama](https://ollama.com) server with the target model
pulled:

```bash
ollama pull llama3.1
python -m evals.cli --model llama3.1 --runs 5
```

Write a JSON report and fail (non-zero exit) if any case falls below the
quality/consistency thresholds in `evals/cli.py`:

```bash
python -m evals.cli --output evals/reports/latest.json --gate
```

Run against a different dataset or model:

```bash
python -m evals.cli --dataset evals/datasets/test_generation.json --model qwen2.5:7b --runs 8
```

## Layout

| File | Purpose |
|------|---------|
| `evals/ollama_client.py` | Thin HTTP client for a local Ollama server. |
| `evals/scorers.py` | Deterministic, reproducible scoring functions. |
| `evals/harness.py` | Runs a dataset N times per case; aggregates mean + consistency. |
| `evals/cli.py` | `python -m evals.cli` entrypoint, with a CI-friendly `--gate` exit code. |
| `evals/datasets/test_generation.json` | Golden dataset: feature descriptions + required keywords per case. |

Unit tests (`tests/unit/test_evals_*.py`) mock every Ollama HTTP call —
none of them require a real Ollama server, matching how the rest of this
repo's AI-feature tests never hit a real Anthropic/Gemini API either.

## Future work

- Wire this into CI against a real (small) local model, with a stored
  baseline report and a regression check on pushes that touch
  `api/ai_prompts.py` or the dataset.
- A second dataset + prompt extraction for AI Failure Triage
  (`POST /api/runs/{id}/triage`).
- An optional LLM-as-judge scorer for qualitative dimensions a deterministic
  check can't reach (e.g. "is this test case actually testable as written"),
  clearly separated from the deterministic scores above.
