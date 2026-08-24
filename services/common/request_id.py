"""Correlation/request ID threading across services.

Every service's request logging (where it had any at all - most of
services/* had none before this) showed unrelated lines with nothing
connecting them: the gateway's inbound HTTP request, its outbound call to
e.g. the auth service, and that service's own downstream call to
projects, all logged independently, with no way to tell they were part of
the same end-to-end request when reading logs across services.

`RequestIDMiddleware` reads `X-Request-ID` from the incoming request (or
mints a new UUID4 if the caller didn't send one - true for the gateway's
first hop from a browser, which never sets this header), stores it in a
contextvar for the lifetime of the request/response cycle, echoes it back
on the response, and logs the request the same way (method, path, status,
latency_ms, request_id) in every service that installs it.

`current_request_id()` reads that contextvar from anywhere - used by
services/common/http.py's `get_with_retry` (and the one direct `httpx.post`
call, in services/projects/main.py) to attach the same ID to outgoing
inter-service calls, so it survives the whole call chain instead of
resetting at each hop.
"""
import logging
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_HEADER = "X-Request-ID"

_request_id: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def current_request_id() -> Optional[str]:
    """The current request's correlation id, or None outside a request
    (e.g. at import time, or in a background task with no request context).
    """
    return _request_id.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Mints or forwards X-Request-ID and logs every request the same way
    across every service that installs this middleware."""

    def __init__(self, app, logger: logging.Logger):
        super().__init__(app)
        self.logger = logger

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        token = _request_id.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            _request_id.reset(token)

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers[REQUEST_ID_HEADER] = request_id
        self.logger.info(
            f"{request.method} {request.url.path} {response.status_code} "
            f"{duration_ms}ms request_id={request_id}"
        )
        return response
