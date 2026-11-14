"""services/worker/kafka_consumer.py - the alerts.triggered queue consumer.

Only the message-handling pieces (parse_alert_message, persist_alert,
handle_alert_message, process_message) are tested directly here, the same
split test_worker_service.py uses for handle_message: the reconnect/consume
loop around them (consume_alerts_forever) is a thin, untested wrapper, its
shape already covered generically by test_events_resilience.py /
test_ws_broadcast.py for the equivalent Redis reconnect loops.

Kafka's own producer/consumer classes are monkeypatched wherever a test
needs to observe what was published to the dead-letter topic - see
test_kafka_producer.py's module docstring for why this repo doesn't lean on
"no broker in this test environment" for Kafka the way it does for Redis.
"""
import pytest
from sqlalchemy.orm import Session

from conftest import import_service_app, reset_db

from services.runs import models
from services.worker import kafka_consumer

app, db_mod = import_service_app("runs")


# ─── parse_alert_message ───────────────────────────────────────────────────

def test_parse_alert_message_accepts_well_formed_payload():
    raw = '{"run_id": 1, "suite_id": 2, "testcase_id": 3, "status": "fail"}'
    data = kafka_consumer.parse_alert_message(raw)
    assert data == {"run_id": 1, "suite_id": 2, "testcase_id": 3, "status": "fail"}


def test_parse_alert_message_rejects_invalid_json():
    with pytest.raises(ValueError, match="malformed JSON"):
        kafka_consumer.parse_alert_message("not valid json")


def test_parse_alert_message_rejects_non_object_json():
    with pytest.raises(ValueError, match="not a JSON object"):
        kafka_consumer.parse_alert_message("[1, 2, 3]")


def test_parse_alert_message_rejects_missing_required_fields():
    with pytest.raises(ValueError, match="missing required fields"):
        kafka_consumer.parse_alert_message('{"run_id": 1}')


# ─── persist_alert ──────────────────────────────────────────────────────────

def test_persist_alert_creates_one_row():
    reset_db(db_mod)
    data = {"run_id": 1, "suite_id": 2, "testcase_id": 3, "status": "fail", "notes": "boom"}
    with Session(db_mod.engine) as db:
        kafka_consumer.persist_alert(db, data)
        rows = db.query(models.Alert).all()
    assert len(rows) == 1
    assert rows[0].run_id == 1 and rows[0].testcase_id == 3 and rows[0].notes == "boom"


def test_persist_alert_is_idempotent_on_run_and_testcase():
    """A consumer's at-least-once redelivery of the same message must not
    duplicate the alert."""
    reset_db(db_mod)
    data = {"run_id": 1, "suite_id": 2, "testcase_id": 3, "status": "fail", "notes": None}
    with Session(db_mod.engine) as db:
        kafka_consumer.persist_alert(db, data)
        kafka_consumer.persist_alert(db, data)  # redelivered
        rows = db.query(models.Alert).all()
    assert len(rows) == 1


# ─── handle_alert_message ───────────────────────────────────────────────────

def test_handle_alert_message_persists_well_formed_message():
    reset_db(db_mod)
    raw = '{"run_id": 7, "suite_id": 1, "testcase_id": 2, "status": "fail"}'
    kafka_consumer.handle_alert_message(raw)
    with Session(db_mod.engine) as db:
        rows = db.query(models.Alert).filter(models.Alert.run_id == 7).all()
    assert len(rows) == 1


def test_handle_alert_message_retries_transient_failure_then_succeeds(monkeypatch):
    """A transient failure (e.g. a DB blip) must be retried, not routed
    straight to the dead-letter topic like a malformed message is."""
    reset_db(db_mod)
    monkeypatch.setattr(kafka_consumer.time, "sleep", lambda seconds: None)

    calls = {"n": 0}
    real_persist = kafka_consumer.persist_alert

    def _flaky_persist(db, data):
        calls["n"] += 1
        if calls["n"] < 2:
            raise Exception("transient DB error")
        real_persist(db, data)

    monkeypatch.setattr(kafka_consumer, "persist_alert", _flaky_persist)

    raw = '{"run_id": 8, "suite_id": 1, "testcase_id": 2, "status": "fail"}'
    kafka_consumer.handle_alert_message(raw)

    assert calls["n"] == 2
    with Session(db_mod.engine) as db:
        assert db.query(models.Alert).filter(models.Alert.run_id == 8).count() == 1


def test_handle_alert_message_raises_transient_error_after_max_retries(monkeypatch):
    reset_db(db_mod)
    monkeypatch.setattr(kafka_consumer.time, "sleep", lambda seconds: None)

    calls = {"n": 0}

    def _always_fails(db, data):
        calls["n"] += 1
        raise Exception("DB is down")

    monkeypatch.setattr(kafka_consumer, "persist_alert", _always_fails)

    raw = '{"run_id": 9, "suite_id": 1, "testcase_id": 2, "status": "fail"}'
    with pytest.raises(kafka_consumer.TransientAlertError):
        kafka_consumer.handle_alert_message(raw)

    assert calls["n"] == kafka_consumer.MAX_RETRIES


def test_handle_alert_message_raises_value_error_for_malformed_message_without_retrying(monkeypatch):
    calls = {"n": 0}
    monkeypatch.setattr(kafka_consumer, "persist_alert", lambda db, data: calls.__setitem__("n", calls["n"] + 1))

    with pytest.raises(ValueError):
        kafka_consumer.handle_alert_message("not valid json")
    assert calls["n"] == 0  # never got past parsing - not a retryable failure


# ─── process_message / dead-letter routing ─────────────────────────────────

class _FakeDlqProducer:
    def __init__(self, *a, **k):
        self.sent = []

    def send(self, topic, value=None):
        self.sent.append((topic, value))

    def flush(self, timeout=None):
        pass


def test_process_message_routes_malformed_message_to_dead_letter_topic(monkeypatch):
    kafka_consumer._dlq_producer = None
    monkeypatch.setattr(kafka_consumer, "KafkaProducer", _FakeDlqProducer)

    kafka_consumer.process_message("not valid json")

    producer = kafka_consumer._dlq_producer
    assert len(producer.sent) == 1
    topic, payload = producer.sent[0]
    assert topic == kafka_consumer.TOPIC_ALERTS_DLQ
    assert payload["raw"] == "not valid json"
    assert "malformed" in payload["reason"]


def test_process_message_routes_retries_exhausted_message_to_dead_letter_topic(monkeypatch):
    reset_db(db_mod)
    kafka_consumer._dlq_producer = None
    monkeypatch.setattr(kafka_consumer, "KafkaProducer", _FakeDlqProducer)
    monkeypatch.setattr(kafka_consumer.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(kafka_consumer, "persist_alert",
                         lambda db, data: (_ for _ in ()).throw(Exception("DB is down")))

    raw = '{"run_id": 10, "suite_id": 1, "testcase_id": 2, "status": "fail"}'
    kafka_consumer.process_message(raw)

    producer = kafka_consumer._dlq_producer
    assert len(producer.sent) == 1
    topic, payload = producer.sent[0]
    assert topic == kafka_consumer.TOPIC_ALERTS_DLQ
    assert "retries exhausted" in payload["reason"]


def test_process_message_does_not_publish_to_dead_letter_topic_on_success(monkeypatch):
    reset_db(db_mod)
    kafka_consumer._dlq_producer = None
    monkeypatch.setattr(kafka_consumer, "KafkaProducer", _FakeDlqProducer)

    raw = '{"run_id": 11, "suite_id": 1, "testcase_id": 2, "status": "fail"}'
    kafka_consumer.process_message(raw)

    assert kafka_consumer._dlq_producer is None  # never even constructed


def test_send_to_dead_letter_returns_false_when_kafka_unreachable(monkeypatch):
    kafka_consumer._dlq_producer = None

    def _raise(*a, **k):
        raise Exception("no brokers available")

    monkeypatch.setattr(kafka_consumer, "KafkaProducer", _raise)

    assert kafka_consumer.send_to_dead_letter("raw", "some reason") is False
