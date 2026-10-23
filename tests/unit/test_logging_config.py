"""Unit tests for services/common/logging_config.py — the JSON log formatter
every microservice uses, including the Datadog trace-correlation fields
ddtrace injects (see docs/datadog.md). No file/network I/O, no ddtrace import:
the injected attributes are set on the record directly, the same way ddtrace's
logging patch sets them."""
import json
import logging
import sys

import pytest

from services.common.logging_config import JsonLogFormatter, configure_json_logging


def _record(message, *args, name="runs", level=logging.INFO, exc_info=None, **attrs):
    record = logging.LogRecord(name=name, level=level, pathname=__file__, lineno=1,
                               msg=message, args=args, exc_info=exc_info)
    for key, value in attrs.items():
        setattr(record, key.replace("__", "."), value)  # dd__trace_id -> "dd.trace_id"
    return record


def _format(record, service="runs"):
    return json.loads(JsonLogFormatter(service).format(record))


def test_configure_json_logging_returns_a_logger_named_for_the_service():
    assert configure_json_logging("gateway").name == "gateway"


def test_configure_json_logging_installs_the_json_formatter_on_root():
    configure_json_logging("auth")
    [handler] = logging.getLogger().handlers
    assert isinstance(handler.formatter, JsonLogFormatter)
    assert handler.formatter.service_name == "auth"


def test_line_has_the_expected_keys():
    payload = _format(_record("POST /token %s %.1fms", 200, 12.3, name="auth.http"), service="auth")
    assert payload["service"] == "auth"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "auth.http"
    assert payload["msg"] == "POST /token 200 12.3ms"
    assert payload["time"].endswith("+00:00")
    assert "dd" not in payload and "error" not in payload


@pytest.mark.parametrize("message", [
    'Request failed: {"detail": "Not found"}',
    "line one\nline two",
    "tab\there and a backslash \\ too",
    "עברית ✓ unicode",
])
def test_messages_that_broke_the_old_format_string_are_valid_json(message):
    assert _format(_record(message))["msg"] == message


def test_trace_context_from_ddtrace_is_nested_under_dd():
    payload = _format(_record("hi", dd__trace_id="6adbc1fe00000000", dd__span_id="1458",
                              dd__service="runs", dd__env="prod", dd__version="2.0.160"))
    assert payload["dd"] == {"trace_id": "6adbc1fe00000000", "span_id": "1458",
                             "service": "runs", "env": "prod", "version": "2.0.160"}


def test_no_dd_block_outside_a_span():
    """ddtrace sets trace_id "0" (and empty service fields when unset) for a
    log made outside any span — nothing to correlate, so no dd block."""
    payload = _format(_record("hi", dd__trace_id="0", dd__span_id="0", dd__service="runs", dd__env=""))
    assert "dd" not in payload


def test_empty_dd_fields_are_dropped():
    payload = _format(_record("hi", dd__trace_id="abc", dd__span_id="1", dd__service="", dd__env="", dd__version=""))
    assert payload["dd"] == {"trace_id": "abc", "span_id": "1"}


def test_exceptions_use_datadogs_error_attributes():
    try:
        raise ValueError('bad "value"')
    except ValueError:
        payload = _format(_record("boom", level=logging.ERROR, exc_info=sys.exc_info()))
    assert payload["level"] == "ERROR"
    assert payload["error"]["kind"] == "ValueError"
    assert payload["error"]["message"] == 'bad "value"'
    assert "Traceback" in payload["error"]["stack"]


def test_non_serializable_args_do_not_crash_formatting():
    class Odd:
        def __str__(self):
            return "odd-object"
    assert _format(_record("value=%s", Odd()))["msg"] == "value=odd-object"
