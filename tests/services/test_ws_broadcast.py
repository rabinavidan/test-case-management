"""services/runs/events.py + main.py — cross-replica WebSocket fan-out.

No Redis runs in this test environment (or CI) — same situation
tests/services/test_events_resilience.py already relies on for the
existing publish-only events, so the fallback-to-local-broadcast path
below is exercised for real, not mocked.
"""
import asyncio
import json
import sys


from conftest import import_service_app
from services.runs import events


def test_publish_ws_broadcast_returns_false_when_redis_unreachable():
    events._client = None
    assert events.publish_ws_broadcast(run_id=1, payload={"type": "x"}) is False


def test_broadcast_result_update_falls_back_to_local_broadcast(monkeypatch):
    """The whole point of the fallback: with Redis unreachable, a single
    replica must still deliver real-time updates to its own connections —
    exactly what happened before this feature existed."""
    events._client = None
    import_service_app("runs")  # ensures services.runs.main is imported and DB-wired
    runs_main = sys.modules["services.runs.main"]

    calls = []

    async def _fake_local_broadcast(run_id, payload):
        calls.append((run_id, payload))

    monkeypatch.setattr(runs_main.ws_manager, "broadcast", _fake_local_broadcast)
    asyncio.run(runs_main.broadcast_result_update(42, {"type": "result_updated"}))
    assert calls == [(42, {"type": "result_updated"})]


class _FakePubSub:
    def __init__(self, messages):
        self._messages = messages

    async def subscribe(self, channel):
        pass

    async def listen(self):
        for message in self._messages:
            yield message


class _FakeRedisClient:
    def __init__(self, messages):
        self._messages = messages

    async def ping(self):
        pass

    def pubsub(self):
        return _FakePubSub(self._messages)


def test_listen_for_ws_broadcasts_parses_and_dispatches_messages(monkeypatch):
    """Subscribe-control messages (type != "message") must be ignored, and
    a real message's JSON payload must reach on_message as (run_id, payload)
    — this is what every replica's subscriber loop does with whatever any
    replica (including itself) published."""
    messages = [
        {"type": "subscribe", "data": 1},
        {"type": "message", "data": json.dumps({"run_id": 5, "payload": {"type": "result_updated"}})},
    ]
    monkeypatch.setattr(events.aioredis, "from_url", lambda *a, **k: _FakeRedisClient(messages))

    received = []

    async def on_message(run_id, payload):
        received.append((run_id, payload))

    async def _drive():
        task = asyncio.create_task(events.listen_for_ws_broadcasts(on_message))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(_drive())
    assert received == [(5, {"type": "result_updated"})]


def test_listen_for_ws_broadcasts_skips_a_message_it_cannot_parse(monkeypatch):
    """A malformed message must not crash the subscriber loop — later,
    well-formed messages must still get through."""
    messages = [
        {"type": "message", "data": "not valid json"},
        {"type": "message", "data": json.dumps({"run_id": 7, "payload": {"ok": True}})},
    ]
    monkeypatch.setattr(events.aioredis, "from_url", lambda *a, **k: _FakeRedisClient(messages))

    received = []

    async def on_message(run_id, payload):
        received.append((run_id, payload))

    async def _drive():
        task = asyncio.create_task(events.listen_for_ws_broadcasts(on_message))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(_drive())
    assert received == [(7, {"ok": True})]
