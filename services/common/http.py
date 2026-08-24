"""Resilience helpers for synchronous inter-service HTTP calls.

Every services/*/main.py that calls another service directly (not through
the gateway) used its own ad-hoc timeout value and no retry at all - a
single dropped connection or a service mid-restart turned into an
immediate failure: either a 503 surfaced to the end user (services/runs's
create_run), or - for the several call sites that degrade gracefully -
silently missing data (services/projects's stats/analytics), even though
the same request would very likely succeed a moment later.

`get_with_retry` retries only on transient network-level failures
(`httpx.ConnectError`, `httpx.TimeoutException`) - never on a response the
target service actually returned (a 404, a 500, whatever that service's
own error handling decided), since that's a real answer, not a blip. It's
also GET-only, deliberately: retrying a non-idempotent call (a POST that
creates something, like services/runs's demo-seed endpoint) risks doing
the create twice if an earlier attempt's response was lost after the
request had already succeeded server-side - so callers making a
non-idempotent call keep using plain `httpx.post` with the same
`DEFAULT_TIMEOUT`, no retry.

Bounded to a few attempts with a short exponential backoff, so a
genuinely-down service still fails fast into the caller's existing
try/except handling (a 503, or graceful degradation) rather than being
retried into masking a real outage behind a long hang.

Every retry also carries the caller's `X-Request-ID` (see
services/common/request_id.py) so the correlation id survives the hop
instead of resetting at each service boundary.
"""
import time
from typing import Optional

import httpx

from .request_id import current_request_id, REQUEST_ID_HEADER

DEFAULT_TIMEOUT = 5.0
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 0.05


def request_id_headers() -> dict:
    """`{"X-Request-ID": <current id>}`, or `{}` outside a request context -
    merge into any outgoing inter-service call's headers to propagate the
    correlation id. Exposed separately (not just used internally by
    get_with_retry) so the one non-idempotent call that bypasses retry
    (services/projects/main.py's httpx.post to seed demo runs) can still
    carry it.
    """
    request_id = current_request_id()
    return {REQUEST_ID_HEADER: request_id} if request_id else {}


def get_with_retry(
    url: str,
    *,
    params: Optional[dict] = None,
    timeout: float = DEFAULT_TIMEOUT,
    max_attempts: int = MAX_ATTEMPTS,
) -> httpx.Response:
    """GET with a bounded number of retries on connection/timeout errors
    only. Raises the last such exception if every attempt fails - callers
    keep their existing try/except handling for "service unreachable".
    """
    kwargs = {"timeout": timeout, "headers": request_id_headers()}
    if params is not None:
        kwargs["params"] = params

    last_exc: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            return httpx.get(url, **kwargs)
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt < max_attempts - 1:
                time.sleep(BACKOFF_BASE_SECONDS * (2 ** attempt))
    raise last_exc
