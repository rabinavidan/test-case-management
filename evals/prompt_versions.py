"""Prompt versioning (course milestone M7).

Every eval target's primary prompt (see each evals/targets/*.py module's
`prompt_id`/`prompt_version` on its `EvalTarget`) gets a version that's a
short hash of its exact text, not a manually incremented counter — so it
always reflects what the prompt currently says and can never drift out of
sync with a change someone forgot to "bump". Recorded in every baseline
(see evals/baseline.py) so a report always knows exactly which prompt text
produced it; evals/baseline.py's compute_prompt_delta() uses it to say
whether a prompt actually changed since the recorded baseline, with the
per-metric delta that change produced. See evals/README.md's "Prompt
versioning" section.
"""
import hashlib


def prompt_version(text: str) -> str:
    """Deterministic: the same prompt text always produces the same
    version, and any change to the text - even one character - produces a
    different one. Truncated to 8 hex chars: this is an identity fingerprint
    for "did this prompt change", not a security hash, so collision
    resistance beyond "won't happen by accident in a repo this size" isn't
    needed."""
    return hashlib.sha256(text.encode()).hexdigest()[:8]
