"""shared/ws_protocol.py — the pure reply function both WebSocket
endpoints (api/main.py, services/runs/main.py) delegate to."""
import json

import pytest

from shared import ws_protocol


def test_legacy_ping_gets_plain_text_pong():
    assert ws_protocol.reply_to("ping") == "pong"


def test_json_ping_gets_json_pong_with_timestamp(monkeypatch):
    monkeypatch.setattr(ws_protocol.time, "time", lambda: 1700000000.9)
    assert json.loads(ws_protocol.reply_to('{"type": "ping"}')) == {"type": "pong", "ts": 1700000000}


@pytest.mark.parametrize("frame", ["", "pong", "{", "null", "42", '"ping"', "[]", "{}"])
def test_non_object_or_typeless_frames_get_an_error(frame):
    reply = json.loads(ws_protocol.reply_to(frame))
    assert reply["type"] == "error"


def test_unknown_type_is_named_in_the_error():
    reply = json.loads(ws_protocol.reply_to('{"type": "subscribe"}'))
    assert reply == {"type": "error", "detail": "Unsupported message type: 'subscribe'"}


def test_close_codes_are_in_the_application_range():
    for code in (ws_protocol.CLOSE_UNAUTHORIZED, ws_protocol.CLOSE_RUN_NOT_FOUND):
        assert 4000 <= code <= 4999
