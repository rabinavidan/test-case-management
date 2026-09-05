"""services/worker — drains services/runs' `runs.populate` Redis Stream,
creating the pending TestResult rows for a newly created TestRun off
services/runs/main.py's create_run request path.

Not a FastAPI app - there's no HTTP surface for a client to call here.
services/runs enqueues (see events.py's enqueue_run_population); this
process is the only consumer, so it's a plain long-running script (see
Dockerfile's `CMD ["python", "main.py"]`), not a server.

This deliberately reuses services/runs' own database engine, models, and
population helper rather than duplicating them: a worker exists to do
runs' work asynchronously, not to own a different slice of the data.
"""
import asyncio
import json
import os

import redis.asyncio as aioredis
from sqlalchemy.orm import Session

from services.common.logging_config import configure_json_logging
from services.runs.database import engine, Base
from services.runs.events import STREAM_RUN_POPULATE, CONSUMER_GROUP_POPULATE, publish_ws_broadcast
from services.runs.population import populate_pending_results

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CONSUMER_NAME = os.getenv("HOSTNAME", "worker-1")
RECONNECT_DELAY_SECONDS = 5

logger = configure_json_logging("worker")

Base.metadata.create_all(bind=engine)


def handle_message(run_id: int, testcase_ids: list[int]) -> None:
    """Populate `run_id`'s pending results, then notify any connected
    browser over the same cross-replica WebSocket channel services/runs
    already publishes result updates on (services/runs' subscriber loop -
    started in its FastAPI lifespan - picks this up and broadcasts to its
    locally connected clients same as any other message on that channel).
    Safe to call twice for the same run: populate_pending_results no-ops
    if results already exist, so an at-least-once redelivery after a crash
    mid-processing can't duplicate rows."""
    with Session(engine) as db:
        populate_pending_results(db, run_id, testcase_ids)
    publish_ws_broadcast(run_id, {"type": "results_populated", "run_id": run_id})
    logger.info(f"Populated results run_id={run_id} testcases={len(testcase_ids)}")


async def _ensure_group(client: aioredis.Redis) -> None:
    try:
        await client.xgroup_create(STREAM_RUN_POPULATE, CONSUMER_GROUP_POPULATE, id="0", mkstream=True)
    except Exception as e:
        if "BUSYGROUP" not in str(e):
            raise


async def consume_forever() -> None:
    """Reconnects on a fixed delay if Redis is unreachable at startup or the
    connection drops later - the same pattern services/runs/events.py's
    listen_for_ws_broadcasts uses for its subscriber loop - so a Redis blip
    doesn't end this process.

    A message that fails to process (a malformed payload, a DB error) is
    still acked rather than redelivered forever: there's no dead-letter
    queue here, so a poison message is logged and dropped instead of
    wedging every run created after it. Good enough for this repo's
    reference deployment - a real one would want a DLQ stream instead."""
    while True:
        try:
            client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await client.ping()
            await _ensure_group(client)
            logger.info("Worker ready, consuming runs.populate")
            while True:
                response = await client.xreadgroup(
                    CONSUMER_GROUP_POPULATE, CONSUMER_NAME,
                    {STREAM_RUN_POPULATE: ">"}, count=1, block=5000,
                )
                for _, entries in response:
                    for message_id, fields in entries:
                        try:
                            payload = json.loads(fields["data"])
                            handle_message(payload["run_id"], payload["testcase_ids"])
                        except Exception as e:
                            logger.warning(f"Failed to process message {message_id}: {e}")
                        await client.xack(STREAM_RUN_POPULATE, CONSUMER_GROUP_POPULATE, message_id)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Redis unavailable, retrying: {e}")
        await asyncio.sleep(RECONNECT_DELAY_SECONDS)


if __name__ == "__main__":
    asyncio.run(consume_forever())
