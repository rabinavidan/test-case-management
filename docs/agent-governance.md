# Cross-agent orchestration and governance

Course milestone M9 (optional in the plan it comes from). This repo runs eight
independent AI agents/features in production and CI — see
[`README.md`'s AI Engineering table](../README.md#ai-engineering--not-just-ai-features)
for the full list. Every one of them is a **single-shot call**: given an
input, it does one thing and returns, with no agent invoking another and no
shared orchestrator sequencing them. That boundary was never accidental —
this note makes the reasoning explicit, per the plan's own framing, rather
than leaving "why isn't there an orchestrator" as an unanswered question a
reviewer has to guess at.

## The single-shot boundary, and why it's there

Group the eight by what actually triggers them:

| Trigger | Agents |
|---|---|
| A GitHub PR event | PR Steward, Coverage-Gap Agent |
| A CI test run | Flaky-Test Detector |
| A human, live in the product | AI Test Generation, AI Failure Triage |
| A human, in a Claude Code session | Playwright Planner, Generator, Healer |
| A human, invoking the eval harness | Test Plan Reviewer (via `agents/`) |

Only one group has a real pipeline shape at all: the Playwright trio. A
planner's output is exactly what a generator consumes; a generator's output
is exactly what a healer later has to fix. The other agents don't feed each
other's inputs — a Coverage-Gap comment doesn't produce input for the Flaky
-Test Detector, and there's no natural "next agent" after AI Failure Triage
completes. An orchestrator that sequenced *all eight* would be solving a
problem none of them actually has; the honest scope for "should there be an
orchestrator" is the Playwright trio alone.

Even scoped to just planner → generator → healer, chaining them
automatically was a deliberate non-goal, not an oversight:

- **The checkpoints are exactly where a human should be looking.** A plan
  the planner writes is a proposal for what to test, not a spec to blindly
  execute — a human reads it, adds scenarios it missed, cuts ones that
  don't matter, before a single line of test code exists. A generated spec
  is a draft PR, not a merge — [`e2e/README.md`'s Playwright Agents
  section](../e2e/README.md#playwright-agents) already says generated specs
  "need the same review as a hand-written PR." Auto-chaining planner
  straight into generator straight into a committed spec removes both
  checkpoints in favor of speed, for a workflow (authoring new E2E
  coverage) that is inherently judgment-heavy, not mechanical. That trade
  is backwards for this repo's stated priorities.
- **A silently-chained failure is worse than a manual step.** If an
  orchestrator ran the healer automatically after every generator run and
  the healer misclassified a real behavior change, that failure would ship
  unnoticed inside an automated pipeline instead of surfacing as "the
  generator's output didn't pass, a human should look." The healer's own
  guardrails (course M4 — see
  [`.claude/agents/playwright-test-healer.md`](../.claude/agents/playwright-test-healer.md))
  exist specifically to stop a masked defect from shipping; wrapping it in
  an orchestrator that runs it unattended reintroduces the same risk one
  layer up.
- **The manual invocation cost is already close to zero.** `@playwright-test-planner`,
  `@playwright-test-generator`, `@playwright-test-healer` — three lines a
  human types when they actually want the full pipeline, with a real
  decision point between each. An orchestrator would remove maybe thirty
  seconds of typing in exchange for a new piece of standing infrastructure
  (state to pass between steps, partial-failure handling, a new
  automatic-vs-manual decision surface for every future change to any of
  the three prompts). That's not a trade worth making yet.

**The concrete signal that would change this call**: if `heal-outcomes/heal_outcomes.jsonl`
(course M4) ever shows the same flow being planned, generated, and healed
repeatedly in the same session — i.e. the three agents are demonstrably
being run back-to-back as a manual pipeline often enough that the typing
cost is real — that's the evidence to revisit this, not a guess about
future convenience. No such pattern exists yet (the log is empty in a
fresh clone of this repo — these are authoring-time agents, not CI jobs,
so there's no synthetic data to fabricate a signal from either).

## A LangGraph orchestrator for the trio, built to the checkpoints above

`agents/pipeline_orchestrator.py` (a later addition than the reasoning
above) is an explicit LangGraph orchestrator for exactly the Playwright
trio this doc identifies as the one place a pipeline shape exists. It does
not contradict the "no auto-chaining" conclusion above — it was built
*around* it. Its authoring graph (plan → generate) uses a real LangGraph
`interrupt()` at both the plan-approval and generation-approval gates: the
graph execution genuinely pauses and returns control to the caller, who
must call back with an explicit approve/reject/revise before it continues.
Nothing in this graph can reach a committed spec without both human
checkpoints firing — the same two checkpoints the bullets above argue are
"exactly where a human should be looking," just formalized as graph edges
instead of three separately-typed `@agent` invocations.

The healer is deliberately its own separate graph, not chained after
generation in the same run: in the real workflow a spec is committed and
run many times in CI before any given run fails, so "generate this spec"
and "heal this failing spec" are not sequential steps of one session — the
governance question they answer is the same, but the trigger and the
elapsed time between them are different. Wiring them into one always-linear
graph would be modeling a workflow that doesn't happen, not simplifying a
real one.

**What this is not**: a replacement for the real, interactive agents in
`.claude/agents/playwright-test-{planner,generator,healer}.md`, which
explore a live page with real Playwright MCP browser tools inside a Claude
Code session and are what actually authors and fixes the specs in this
repo. `pipeline_orchestrator.py`'s plan/generate nodes are LLM-only (no
browser) — a headless illustration of the orchestration shape (a real
agent-framework graph, a real interrupt-based human-in-the-loop gate, and,
in the healer graph, a real classify → fix → retry planning loop with the
same escalate-on-behavior-change guardrail), not a second implementation
of what the interactive agents do.

## Unified agent telemetry

Course M6 gave the two agents that emit structured, parseable telemetry —
the AI provider gateway (`api/ai_gateway.py`, logging every AI Test
Generation/Triage call) and the Playwright healer (`heal-outcomes/heal_outcomes.jsonl`,
course M4) — each their own metrics script
(`scripts/ai_call_metrics.py`, `scripts/heal_metrics.py`). Those two logs
have genuinely different shapes (a per-API-call record vs. a
per-healing-session record) and answer different questions, so merging them
into one log format would blur both; **unifying the view**, not the schema,
is what `scripts/agent_telemetry.py` (this milestone) does — one command
that runs both scripts and returns their summaries side by side, so a
human or CI job checking "how are the agents doing" doesn't have to know
there are two separate logs to look in.

```
python -m scripts.agent_telemetry
```

Other agents in the table above (PR Steward, Coverage-Gap, Flaky-Test
Detector, Test Plan Reviewer) don't have their own structured telemetry log
yet — this view reports what exists today (healer, AI gateway) rather than
inventing placeholder sections for the rest. Extending one of them the same
way `api/ai_gateway.py` and the healer's outcome log already work is future
work, not a gap being papered over here.
