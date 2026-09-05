"""services/runs/events.py — validates the README's explicit claim that the
app "degrades gracefully if Redis is down." No Redis is running in this test
environment (or CI), which makes it a natural, always-on check for exactly
that claim rather than something that needs mocking.
"""
from services.runs import events


def test_publish_run_completed_does_not_raise_when_redis_unreachable():
    events._client = None  # force a fresh connection attempt
    events.publish_run_completed(run_id=1, suite_id=1, pass_count=1, fail_count=0, skip_count=0)


def test_get_client_returns_none_when_redis_unreachable():
    events._client = None
    assert events._get_client() is None


def test_enqueue_run_population_returns_false_when_redis_unreachable():
    events._client = None
    assert events.enqueue_run_population(run_id=1, testcase_ids=[1, 2]) is False
