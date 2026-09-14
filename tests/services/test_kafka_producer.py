"""services/runs/kafka_events.py - the Kafka producer for alert.triggered
events, published whenever a result is recorded as "fail" (see
test_update_result_publishes_alert_on_fail in test_runs_service.py).

Unlike events.py's Redis tests (test_events_resilience.py), which rely on no
Redis genuinely running in this test environment for a fast connection-refused
failure, a Kafka client's bootstrap/connect path isn't fast or reliable enough
to lean on the same way - so every test here monkeypatches KafkaProducer
itself rather than touching the network at all.
"""
from conftest import import_service_app
from services.runs import kafka_events

import_service_app("runs")  # ensures services.runs.main is importable/DB-wired


class _FakeKafkaProducer:
    def __init__(self, *args, **kwargs):
        self.sent = []

    def send(self, topic, value=None):
        self.sent.append((topic, value))

    def flush(self, timeout=None):
        pass


def _reset():
    kafka_events._producer = None


def test_publish_alert_triggered_returns_false_when_kafka_unreachable(monkeypatch):
    _reset()

    def _raise(*a, **k):
        raise Exception("no brokers available")

    monkeypatch.setattr(kafka_events, "KafkaProducer", _raise)

    assert kafka_events.publish_alert_triggered(
        run_id=1, suite_id=1, testcase_id=1, status="fail", notes=None,
    ) is False
    assert kafka_events._producer is None


def test_publish_alert_triggered_sends_expected_payload(monkeypatch):
    _reset()
    monkeypatch.setattr(kafka_events, "KafkaProducer", _FakeKafkaProducer)

    ok = kafka_events.publish_alert_triggered(
        run_id=5, suite_id=2, testcase_id=9, status="fail", notes="assertion failed",
    )
    assert ok is True

    producer = kafka_events._producer
    assert len(producer.sent) == 1
    topic, payload = producer.sent[0]
    assert topic == kafka_events.TOPIC_ALERTS_TRIGGERED
    assert payload == {
        "event": "alert.triggered",
        "run_id": 5,
        "suite_id": 2,
        "testcase_id": 9,
        "status": "fail",
        "notes": "assertion failed",
    }


def test_publish_alert_triggered_returns_false_when_send_fails(monkeypatch):
    """A broker that accepted the connection but then drops the send (e.g.
    mid-flush) must not raise into the caller - same graceful-degradation
    contract as the unreachable-at-connect-time case above."""
    _reset()

    class _BrokenProducer(_FakeKafkaProducer):
        def send(self, topic, value=None):
            raise Exception("broker went away mid-send")

    monkeypatch.setattr(kafka_events, "KafkaProducer", _BrokenProducer)

    assert kafka_events.publish_alert_triggered(
        run_id=1, suite_id=1, testcase_id=1, status="fail", notes=None,
    ) is False


def test_get_producer_is_reused_across_calls(monkeypatch):
    _reset()
    monkeypatch.setattr(kafka_events, "KafkaProducer", _FakeKafkaProducer)

    first = kafka_events._get_producer()
    second = kafka_events._get_producer()
    assert first is second
