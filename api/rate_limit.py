"""Rate limiting for the auth endpoints (slowapi)."""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiting on auth endpoints — brute-force/credential-stuffing protection.
# In-memory storage is per-process, which is fine for a single-instance
# deployment; a multi-instance deployment would need a shared backend
# (e.g. Redis) for the limit to apply across processes. Disabled under the
# test suite (tests/conftest.py sets this) since Schemathesis's fuzzing and
# the sheer number of register/login calls across the suite would otherwise
# trip the same limit real brute-force traffic is meant to hit.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=os.getenv("TESTFLOW_DISABLE_RATE_LIMIT") != "1",
)
