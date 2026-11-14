# Specs

Test plans written by the `playwright-test-planner` agent (see
[`e2e/README.md#playwright-agents`](../e2e/README.md#playwright-agents)) —
one markdown file per exploration session, each scenario broken into
numbered steps the `playwright-test-generator` agent turns into real specs
under `e2e/tests/`.

Each plan `<name>.md` has a `<name>.context.json` sibling (course milestone
M8) — the planner's structured record of the ordered journey it took and
the role/accessible-name of every interactive element it used, captured
from the accessibility tree rather than CSS selectors. See
[`scripts/context_artifact.py`](../scripts/context_artifact.py) for the
schema. The generator and healer agents read it before falling back to
live exploration, so the same flow isn't re-derived from scratch by every
agent that touches it.

Not consumed by CI; this is authoring/planning output, kept for reference
and re-generation.
