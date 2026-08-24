# AI-Assisted Automation Workflow

This suite is built and maintained with AI development tools and agents in the
loop, not just hand-written. The goal is faster authoring and lower maintenance
while keeping every generated test reviewed and deterministic.

## Playwright MCP

The suite depends on [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp)
(see `package.json` devDependencies), which exposes Playwright as an MCP server so
an AI agent can drive a real browser: inspect the live DOM, resolve robust
`data-testid` locators, and draft page objects and specs against the actual app
instead of guessing selectors.

Typical loop:

1. Point the agent (via MCP over CLI) at a running instance (`http://localhost:8000`
   or the deployed Vercel URL).
2. The agent explores the target flow, reads the real DOM and proposes a spec plus
   any missing page-object methods under `pages/`.
3. Output is reviewed, tightened to the suite's conventions (POM, `test.step`,
   `data-testid` strategy, unique-name + cleanup helpers) and committed.

## Claude for test generation

The application itself ships an AI test-generation endpoint
(`POST /api/suites/{id}/testcases/generate`) backed by Anthropic Claude, which
drafts structured test cases from a suite's context. The same model is used
during development to:

- generate first-draft specs and page objects from a described flow,
- explain and triage CI failures from Playwright traces and the JSON report,
- refactor locators and de-flake timing-sensitive steps,
- keep this suite and the parallel `pytest` layer in sync.

## Guardrails

AI accelerates authoring; it does not get a free pass into `main`:

- every generated spec is reviewed and must pass locally before commit,
- selectors go through the `data-testid` strategy, never brittle text/CSS,
- generated tests must clean up their own data (see the `afterEach` patterns),
- flaky output is fixed or dropped, not merged.
