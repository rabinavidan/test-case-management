"""Run-collaboration WebSocket protocol, shared by the monolith (api/main.py)
and the runs microservice (services/runs/main.py) so both endpoints speak
exactly the same wire format. The contract is documented in
docs/asyncapi.yaml.

Connection: `/ws/runs/{run_id}?token=<JWT>`. Browsers can't set an
`Authorization` header on a WebSocket handshake, so the token travels as a
query parameter. The server always *accepts* the socket first and then
closes it with an application close code (4000-4999) on failure: closing
before accept turns into an HTTP 403 at the handshake, which browsers
surface only as an opaque 1006 — a client (or test) couldn't tell "bad
token" from "run doesn't exist".

Client -> server messages:
  - `"ping"` (legacy plain text, still sent by static/app.js) -> `"pong"`
  - `{"type": "ping"}` -> `{"type": "pong", "ts": <unix seconds>}`
  - anything else -> `{"type": "error", "detail": ...}`; the socket stays
    open, a malformed frame from one tab shouldn't drop it from the room.

Server -> client broadcasts (`result_updated`, `results_populated`) are
flat JSON objects discriminated by `type`, unchanged from before.
"""
import json
import time
from typing import Optional

# Application close codes (RFC 6455 reserves 4000-4999 for applications).
# Mirrors the HTTP status the equivalent REST call would return.
CLOSE_UNAUTHORIZED = 4401
CLOSE_RUN_NOT_FOUND = 4404

LEGACY_PING = "ping"
LEGACY_PONG = "pong"


def reply_to(message: str) -> Optional[str]:
    """Return the text frame to send back for one client `message`, or
    None if nothing should be sent."""
    if message == LEGACY_PING:
        return LEGACY_PONG
    try:
        data = json.loads(message)
    except (ValueError, TypeError):
        return json.dumps({"type": "error", "detail": "Malformed message: expected JSON"})
    if not isinstance(data, dict) or "type" not in data:
        return json.dumps({"type": "error", "detail": "Message must be an object with a 'type' field"})
    if data["type"] == "ping":
        return json.dumps({"type": "pong", "ts": int(time.time())})
    return json.dumps({"type": "error", "detail": f"Unsupported message type: {data['type']!r}"})
