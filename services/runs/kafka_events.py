"""Kafka producer for alert events - published whenever a test result is
recorded as "fail", for services/worker's alert-ingestion consumer
(services/worker/kafka_consumer.py) to pick up.

Mirrors events.py's graceful-degradation shape: if the Kafka broker is
unreachable, publish_alert_triggered no-ops (returns False) rather than
failing or slowing down the result-update request that triggers it -
services/worker's consumer is the only reader, so a message that's never
produced is just an alert that's never raised, not lost data.
"""
import json
import logging
import os

from kafka import KafkaProducer

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC_ALERTS_TRIGGERED = "alerts.triggered"
PRODUCER_TIMEOUT_MS = 3000

_producer: KafkaProducer | None = None
logger = logging.getLogger("runs.kafka_events")


def _get_producer() -> KafkaProducer | None:
    global _producer
    if _producer is None:
        try:
            _producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                request_timeout_ms=PRODUCER_TIMEOUT_MS,
                max_block_ms=PRODUCER_TIMEOUT_MS,
            )
        except Exception as e:
            logger.warning(f"Kafka unavailable, alert events disabled: {e}")
            _producer = None
    return _producer


def publish_alert_triggered(run_id: int, suite_id: int, testcase_id: int,
                             status: str, notes: str | None) -> bool:
    """Publish an alert.triggered event for a failed test result. Returns
    True once handed to the producer, False if Kafka is unreachable - the
    caller (services/runs/main.py's update_result) ignores the return
    value, same as publish_run_completed: raising an alert is best-effort,
    never something that should fail the result-update request itself."""
    producer = _get_producer()
    if not producer:
        return False
    payload = {
        "event": "alert.triggered",
        "run_id": run_id,
        "suite_id": suite_id,
        "testcase_id": testcase_id,
        "status": status,
        "notes": notes,
    }
    try:
        producer.send(TOPIC_ALERTS_TRIGGERED, value=payload)
        producer.flush(timeout=PRODUCER_TIMEOUT_MS / 1000)
        logger.info(f"Published alert.triggered run_id={run_id} testcase_id={testcase_id}")
        return True
    except Exception as e:
        logger.warning(f"Failed to publish alert event: {e}")
        return False
