"""Registry of eval targets, keyed by the name evals/cli.py's --target
flag selects. Add a new feature's target module here to make it runnable."""
from evals.targets import test_generation, triage

TARGETS = {
    test_generation.TARGET.name: test_generation,
    triage.TARGET.name: triage,
}
