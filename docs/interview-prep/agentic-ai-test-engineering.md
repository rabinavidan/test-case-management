# Interview Prep — Agentic AI Test Engineering (eval harnesses + agent frameworks)

Personal notes mapping this repo (TestFlow) to a recurring gap found while reviewing several strong postings
(the kind NICE, Iguazio, and SQLink post) against the existing CV — not project documentation. Those postings
asked specifically for hands-on **evaluation-harness design for non-deterministic systems**, **prompt
engineering for test generation**, and **familiarity with agent frameworks (LangChain, AutoGen, CrewAI)**. The
CV already covered using AI agents and LLM workflows day-to-day; what it didn't have a concrete answer for was
"how do you know your non-deterministic agent's output is actually good" or "have you built anything with an
agent framework, not just called an API." This repo already ran real agentic AI in CI/CD (see the root
README's AI Engineering section) before this work — what it was missing is documented below, then closed,
across three sequential PRs ([#210](https://github.com/rabinavidan/test-case-management/pull/210),
[#211](https://github.com/rabinavidan/test-case-management/pull/211),
[#212](https://github.com/rabinavidan/test-case-management/pull/212)).

## Requirement-by-requirement mapping

| Job requirement (as posted) | Repo evidence | File / link |
|---|---|---|
| Hands-on design of evaluation harnesses for non-deterministic systems | `evals/harness.py`'s `EvalTarget` abstraction runs each dataset case **N times** and reports both mean quality *and* the standard deviation across runs — the actual point is measuring consistency, not just a single pass/fail | [`evals/README.md`](../../evals/README.md), `evals/harness.py` |
| Same, applied to more than one feature | Two targets registered (`evals/targets/test_generation.py`, `evals/targets/triage.py`) sharing one harness — a third feature is "add one target module," not "rebuild the harness" | `evals/targets/__init__.py` |
| Prompt engineering for test generation | `api/ai_prompts.py` extracted so the harness evaluates the exact production prompt, not a copy; the eval process itself drove a real prompt iteration (see the deep-dive below) with a measured before/after, not a guess | `api/ai_prompts.py`, `agents/README.md`'s "a real model, a real failure" section |
| Familiarity with agent frameworks (LangChain, AutoGen, CrewAI) | A genuine two-step LangChain pipeline (`prompt \| llm \| parser`, LCEL) — a critic step and a drafter step where the second step's prompt depends on the first's output — deliberately scoped to where a framework earns its keep, not bolted onto every feature | [`agents/README.md`](../../agents/README.md), `agents/test_plan_reviewer.py` |
| Cost-conscious LLM evaluation at scale | Every eval run and every agent call goes through a local [Ollama](https://ollama.com) model — no API key, no per-call cost — which is what makes running a case 5+ times, repeatedly, in CI or locally, practical in the first place | `evals/ollama_client.py`, `.github/workflows/eval-harness.yml` |

## Technical deep-dive: what a "hands-on" answer sounds like

These are real findings from building this, not rehearsed talking points — the kind of detail that survives a
follow-up question.

1. **A single run can't tell you if a prompt is reliable.** Running `evals/cli.py --target test_generation`
   against a real `qwen2.5:0.5b` model produced `schema_score` mean 0.5, stdev 0.5 across 2 runs on the
   `login-flow` case — one run's JSON was schema-valid, the other wasn't. A harness that ran the prompt once
   would have reported whichever result it happened to get as "the" answer. That's the concrete difference
   between testing a deterministic function and evaluating a model.

2. **Structured-output reliability is itself a prompt-engineering lever, not just a temperature setting.**
   Building the LangChain agent, the first attempt (temperature 0.7, matching the eval harness's default) had
   the model return plain prose instead of JSON despite the system prompt demanding JSON only. Lowering
   temperature to 0.2 and rewording the instruction to "Respond ONLY with a JSON object, no other text" fixed
   it in practice — a measured change, verified by rerunning against the real model, not a cargo-culted
   default.

3. **Adding a framework surfaced real dependency conflicts, and they got resolved deliberately, not papered
   over.** `langchain-ollama`'s own `ollama` client requires `httpx>=0.27`; naively upgrading to the latest
   httpx (0.28+) broke `starlette`'s `TestClient` because 0.28 removed the `Client(app=...)` shortcut it
   relies on — pinned `httpx==0.27.2` instead, the newest release that still supports it. Separately,
   `langchain-core` requires `pydantic>=2.7.4`, conflicting with the app's existing `pydantic==2.5.0` pin —
   resolved by bumping the app's pin and rerunning the *entire* test suite before trusting the change, not just
   assuming a minor-version bump was safe.

4. **A framework is a tool for a specific shape of problem, used only where that shape exists.** Every other
   agent in this repo (PR Steward, Coverage-Gap Agent, AI Test Generation, AI Failure Triage) is a single-shot
   LLM call, hand-rolled against a plain HTTP client, on purpose — that's all a single call needs, and adding
   LangChain there would be complexity with no payoff. The Test Plan Reviewer needed a framework because its
   second step's prompt is genuinely built from the first step's output. Being able to articulate *why* a tool
   was or wasn't used is a stronger signal than using it everywhere.

## Honest gaps — don't oversell these

- **The CI eval-harness run is informational, not a blocking gate yet.** `.github/workflows/eval-harness.yml`
  runs both targets against a real model and writes a job summary, but doesn't fail the build — a 0.5B CPU
  model's output varies enough run to run that a hard gate needs a calibrated per-model baseline first, which
  doesn't exist yet. Be upfront about this if asked "so it blocks bad prompts from merging?" — not yet, that's
  the natural next step, and the reasoning for not rushing it is itself a legitimate engineering answer.
- **Deterministic scorers only — no LLM-as-judge.** A reasonable next step for qualitative dimensions
  (schema validity and keyword coverage can't tell you "is this test case actually testable as written"), but
  intentionally deferred: a scorer that itself calls a model adds a second layer of non-determinism on top of
  the thing being measured, and that trade-off needs its own justification, not just "add a judge."
- **Two features covered, not every AI feature in the repo.** The Coverage-Gap Agent (Gemini-backed) has no
  eval target yet.
- **The Test Plan Reviewer is CLI-only**, not wired into the API the way AI Test Generation and AI Failure
  Triage are.
- **LangChain only — no hands-on AutoGen or CrewAI.** If a posting specifically asks about one of those, say so
  plainly rather than implying broader framework experience than exists. What transfers directly: prompt/role
  separation across pipeline steps, structured-output parsing, and treating a model's non-conformance to a
  schema as a first-class failure mode to handle — those aren't LangChain-specific ideas.
- **Only one small local model tested.** No cross-model comparison (e.g. does a 7B model need less prompt
  hand-holding than the 0.5B one used here) — a natural extension, not something to claim was already done.

## Talking points for the interview

1. **"Evaluating a non-deterministic system means measuring the *spread*, not just the average."** Lead with
   the `schema_score` mean-0.5/stdev-0.5 example — it's concrete, it's real, and it directly answers "tell me
   about a time you evaluated an LLM feature" without hand-waving.

2. **"I use a framework where the problem is shaped for it, not by default."** Walk through the critic/drafter
   pipeline and contrast it with this repo's other, deliberately framework-free agents. This answers "why
   LangChain" better than "because the job posting asked for it."

3. **"Adding new tooling to an existing system means resolving what it breaks, not just what it adds."** The
   httpx/pydantic dependency conflicts are a genuine "here's how I debug an unfamiliar failure" story:
   reproduce, isolate the actual constraint (`pip show`, reading `Requires-Dist`), pick the narrowest fix, and
   validate against the full existing test suite before trusting it.

4. **"Cost and iteration speed are part of the design, not an afterthought."** Every eval run and agent call in
   this work goes through a local model — zero marginal cost is what made running a prompt 5+ times, and
   iterating on temperature/instructions with real feedback, actually practical during development.

## Questions worth asking them

- How do you currently evaluate whether a prompt change (or a new agent) is actually an improvement before it
  ships — a formal eval harness, spot-checking, production monitoring, something else?
- Which agent framework(s) do you standardize on, and was that a deliberate choice or whatever a first
  prototype happened to use?
- Is there an existing regression gate on model/prompt quality in CI, or is that still an open problem on your
  side too?
