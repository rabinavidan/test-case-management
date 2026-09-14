"""Kafka consumer for services/runs' alerts.triggered topic - persists valid
alert events into runs_alerts (services/runs/models.py's Alert), reusing
services/runs' own database engine/models directly, same as
services/worker/main.py already does for TestResult.

Mirrors main.py's handle_message / consume_forever split: handle_alert_message
is unit-testable on its own; the reconnect/consume loop around it
(consume_alerts_forever) follows the same reconnect-on-a-fixed-delay shape.

A message that fails to parse (bad JSON, missing required fields) is never
retried - it's routed straight to the alerts.triggered.dlq dead-letter topic
since retrying it would just fail the same way forever. A message that fails
for a transient reason (e.g. a DB error) is retried up to MAX_RETRIES times
with a short backoff before it, too, is routed to the dead-letter topic -
better than silently dropping it, and better than wedging every alert
raised after it the way an infinite retry loop would.
"""
import json
import logging
import time

from kafka import KafkaProducer
from sqlalchemy.orm import Session

from services.runs.database import engine
from services.runs import models
from services.runs.kafka_events import KAFKA_BOOTSTRAP_SERVERS, TOPIC_ALERTS_TRIGGERED, PRODUCER_TIMEOUT_MS

TOPIC_ALERTS_DLQ = "alerts.triggered.dlq"
CONSUMER_GROUP_ALERTS = "alert-ingesters"
REQUIRED_FIELDS = ("run_id", "suite_id", "testcase_id", "status")
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 1
RECONNECT_DELAY_SECONDS = 5

logger = logging.getLogger("worker.kafka_consumer")

_dlq_producer: KafkaProducer | None = None


class TransientAlertError(Exception):
    """Raised by handle_alert_message once MAX_RETRIES attempts at
    persisting a well-formed message have all failed - the caller
    (process_message) routes this to the dead-letter topic same as a
    malformed message, rather than retrying forever."""


def parse_alert_message(raw: bytes | str) -> dict:
    """Raises ValueError for anything that isn't a well-formed alert
    payload - process_message routes that straight to the dead-letter
    topic without ever calling persist_alert."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValueError(f"malformed JSON: {e}")
    if not isinstance(data, dict):
        raise ValueError("payload is not a JSON object")
    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        raise ValueError(f"missing required fields: {missing}")
    return data


def persist_alert(db: Session, data: dict) -> None:
    """Insert one Alert row, deduplicated on (run_id, testcase_id) so an
    at-least-once redelivery of the same message can't create duplicates -
    the same idempotency shape as population.populate_pending_results."""
    exists = db.query(models.Alert).filter(
        models.Alert.run_id == data["run_id"],
        models.Alert.testcase_id == data["testcase_id"],
    ).first()
    if exists:
        return
    db.add(models.Alert(
        run_id=data["run_id"], suite_id=data["suite_id"], testcase_id=data["testcase_id"],
        status=data["status"], notes=data.get("notes"),
    ))
    db.commit()


def handle_alert_message(raw: bytes | str) -> None:
    """Validate + persist one alert message. Raises ValueError for a
    malformed message (never retried) or TransientAlertError once
    MAX_RETRIES attempts at persisting a well-formed one have all failed -
    process_message routes both to the dead-letter topic."""
    data = parse_alert_message(raw)  # malformed -> ValueError, not retried below

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with Session(engine) as db:
                persist_alert(db, data)
            logger.info(f"Persisted alert run_id={data['run_id']} testcase_id={data['testcase_id']}")
            return
        except Exception as e:
            last_error = e
            logger.warning(f"Transient failure persisting alert (attempt {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS)
    raise TransientAlertError(str(last_error))


def _get_dlq_producer() -> KafkaProducer | None:
    global _dlq_producer
    if _dlq_producer is None:
        try:
            _dlq_producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                request_timeout_ms=PRODUCER_TIMEOUT_MS,
                max_block_ms=PRODUCER_TIMEOUT_MS,
            )
        except Exception as e:
            logger.warning(f"Kafka unavailable, cannot publish to dead-letter topic: {e}")
            _dlq_producer = None
    return _dlq_producer


def send_to_dead_letter(raw: bytes | str, reason: str) -> bool:
    producer = _get_dlq_producer()
    if not producer:
        logger.error(f"Dropping alert message (dead-letter topic unavailable): {reason}")
        return False
    text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else raw
    try:
        producer.send(TOPIC_ALERTS_DLQ, value={"raw": text, "reason": reason})
        producer.flush(timeout=PRODUCER_TIMEOUT_MS / 1000)
        return True
    except Exception as e:
        logger.error(f"Failed to publish to dead-letter topic: {e}")
        return False


def process_message(raw: bytes | str) -> None:
    """Top-level entry point for one consumed Kafka message - never raises,
    so consume_alerts_forever below can always ack/commit the offset after
    calling it (a poison message is routed to the dead-letter topic once,
    not retried forever)."""
    try:
        handle_alert_message(raw)
    except ValueError as e:
        logger.warning(f"Malformed alert message, routing to dead-letter topic: {e}")
        send_to_dead_letter(raw, f"malformed: {e}")
    except TransientAlertError as e:
        logger.error(f"Alert message failed after {MAX_RETRIES} attempts, routing to dead-letter topic: {e}")
        send_to_dead_letter(raw, f"retries exhausted: {e}")


def consume_alerts_forever() -> None:
    """Reconnects on a fixed delay if Kafka is unreachable at startup or the
    connection drops later - the same pattern services/worker/main.py's
    consume_forever uses for the Redis stream. Blocking (kafka-python has no
    asyncio client), so services/worker/main.py runs this in a background
    thread alongside consume_forever's asyncio loop."""
    from kafka import KafkaConsumer

    while True:
        try:
            consumer = KafkaConsumer(
                TOPIC_ALERTS_TRIGGERED,
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                group_id=CONSUMER_GROUP_ALERTS,
                enable_auto_commit=False,
                consumer_timeout_ms=5000,
            )
            logger.info("Worker ready, consuming alerts.triggered")
            while True:
                for message in consumer:
                    process_message(message.value)
                    consumer.commit()
        except Exception as e:
            logger.warning(f"Kafka unavailable, retrying: {e}")
        time.sleep(RECONNECT_DELAY_SECONDS)
