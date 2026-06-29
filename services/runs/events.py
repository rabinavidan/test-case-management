"""Redis Pub/Sub publisher for run lifecycle events."""
import os, json, logging
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_client: redis.Redis | None = None
logger = logging.getLogger("runs.events")

CHANNEL_RUN_COMPLETED = "runs.completed"


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
