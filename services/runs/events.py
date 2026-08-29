"""Redis Pub/Sub for run lifecycle events and cross-replica WebSocket fan-out.

`ConnectionManager` (services/runs/main.py) only ever tracked WebSocket
connections held open by *this process* — fine for a single `runs`
instance, but with more than one replica behind a load balancer, a client
connected to replica A never sees a broadcast triggered by an HTTP request
that happened to land on replica B; A's in-memory `_rooms` dict has no way
to know about it. `publish_ws_broadcast` + `listen_for_ws_broadcasts` fix
that: instead of broadcasting to local connections directly, a replica
publishes the update to Redis, and *every* replica's own subscriber loop
(including the one that published) receives it and broadcasts to its own
local connections. `services/runs/main.py`'s `broadcast_result_update`
falls back to a direct local broadcast when Redis is unreachable, so a
single-replica / no-Redis setup (this repo's own tests, or `docker compose`
without the redis container) behaves exactly as before this existed - it
just won't fan out to replicas it can't reach any other way either.
"""
import asyncio
import os
import json
import logging
from typing import Awaitable, Callable

import redis
import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_client: redis.Redis | None = None
logger = logging.getLogger("runs.events")

CHANNEL_RUN_COMPLETED = "runs.completed"
CHANNEL_WS_BROADCAST = "runs.ws_broadcast"
RECONNECT_DELAY_SECONDS = 5


def _get_client() -> redis.Redis | None:
    global _client
    if _client is None:
        try:
            _client = redis.from_url(REDIS_URL, decode_responses=True)
            _client.ping()
        except Exception as e:
            logger.warning(f"Redis unavailable, events disabled: {e}")
            _client = None
    return _client


def publish_run_completed(run_id: int, suite_id: int, pass_count: int,
                           fail_count: int, skip_count: int):
    client = _get_client()
    if not client:
        return
    payload = json.dumps({
        "event": "run.completed",
        "run_id": run_id,
        "suite_id": suite_id,
        "pass": pass_count,
        "fail": fail_count,
        "skip": skip_count,
    })
    try:
        client.publish(CHANNEL_RUN_COMPLETED, payload)
        logger.info(f"Published run.completed run_id={run_id}")
    except Exception as e:
        logger.warning(f"Failed to publish event: {e}")


def publish_ws_broadcast(run_id: int, payload: dict) -> bool:
    """Publish a WebSocket broadcast for `run_id` to every replica's
    subscriber loop. Returns True once published, False if Redis is
    unreachable - the caller (services/runs/main.py's
    `broadcast_result_update`) falls back to broadcasting only to this
    replica's own connections in that case."""
    client = _get_client()
    if not client:
        return False
    try:
        client.publish(CHANNEL_WS_BROADCAST, json.dumps({"run_id": run_id, "payload": payload}))
        return True
    except Exception as e:
        logger.warning(f"Failed to publish ws broadcast: {e}")
        return False


async def listen_for_ws_broadcasts(on_message: Callable[[int, dict], Awaitable[None]]):
    """Background task: subscribe to CHANNEL_WS_BROADCAST and await
    `on_message(run_id, payload)` for every message received, from any
    replica - including this one's own publishes (Redis delivers to every
    subscriber of a channel, publisher included). Reconnects on a fixed
    delay if Redis is unreachable at startup or the connection drops later,
    rather than giving up on cross-replica fan-out for the process's
    lifetime. Runs until cancelled (see services/runs/main.py's lifespan).
    """
    while True:
        try:
            client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await client.ping()
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL_WS_BROADCAST)
            logger.info("Subscribed to ws broadcast channel")
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    await on_message(data["run_id"], data["payload"])
                except Exception as e:
                    logger.warning(f"Bad ws broadcast message: {e}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Redis ws-broadcast subscriber unavailable: {e}")
        await asyncio.sleep(RECONNECT_DELAY_SECONDS)
