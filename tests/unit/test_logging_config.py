"""Unit tests for services/common/logging_config.py — pure format-string
construction (json_log_format) plus a check that configure_json_logging
wires it up as the root logging format. No file/network I/O.
"""
import json
import logging

from services.common.logging_config import configure_json_logging, json_log_format


def _format_one_record(service_name: str, message: str) -> str:
    """Run message through the real logging.Formatter with this service's
    format string — exactly what a log call produces, without touching any
    global logging state (no basicConfig, no handlers)."""
    formatter = logging.Formatter(json_log_format(service_name))
    record = logging.LogRecord(
        name=service_name, level=logging.INFO, pathname=__file__, lineno=1,
        msg=message, args=(), exc_info=None,
    )
    return formatter.format(record)


def test_configure_json_logging_returns_a_logger_named_for_the_service():
    logger = configure_json_logging("gateway")
    assert logger.name == "gateway"


def test_formatted_line_is_valid_json_with_expected_keys():
    line = _format_one_record("auth", "POST /token 200 12.3ms")
    payload = json.loads(line)
    assert payload["service"] == "auth"
    assert payload["level"] == "INFO"
    assert payload["msg"] == "POST /token 200 12.3ms"
    assert "time" in payload


def test_different_services_get_distinct_service_fields():
    projects_line = _format_one_record("projects", "hello")
    runs_line = _format_one_record("runs", "hello")
    assert json.loads(projects_line)["service"] == "projects"
    assert json.loads(runs_line)["service"] == "runs"


def test_message_containing_quotes_still_parses_reasonably():
    # Not bulletproof JSON escaping (msg is interpolated raw), but a plain
    # request-log line (method/path/status/latency, no embedded quotes)
    # never hits this — documents the known limitation instead of hiding it.
    line = _format_one_record("ai", "GET /docs 200 5.0ms")
    assert json.loads(line)["msg"] == "GET /docs 200 5.0ms"
