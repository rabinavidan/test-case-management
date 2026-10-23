"""Structured (JSON) logging, shared by every microservice.

Milestone 5 (GCP DevOps plan) calls for Cloud Logging to receive structured
entries so they show up with a parsed jsonPayload (severity, service name,
message) instead of an opaque text blob — mirrors api/main.py's own
logging.basicConfig format, applied once here instead of five times.
"""
import json
import logging
from datetime import datetime, timezone


# ddtrace (when DD_LOGS_INJECTION=true and tracing is on) sets these on every
# LogRecord made inside a span; see docs/datadog.md. Read with getattr so this
# module never imports ddtrace and works the same with tracing off.
_DD_RECORD_ATTRS = ("trace_id", "span_id", "service", "env", "version")


class JsonLogFormatter(logging.Formatter):
    """One JSON object per line, built with json.dumps — so a message with
    quotes, newlines or a traceback is still valid JSON (the earlier %-style
    format string interpolated the message raw and broke on those).

    Keys stay `time`/`level`/`service`/`msg`, which both Cloud Logging and
    Datadog map to timestamp/severity/service/message without extra parsing
    rules. When ddtrace has injected trace context, a nested `dd` object
    (`dd.trace_id`, `dd.span_id`, ...) is added — the attribute Datadog uses
    to link a log line to its APM trace. Exceptions go under `error`, using
    Datadog's standard `error.kind`/`error.message`/`error.stack` names."""

    def __init__(self, service_name: str):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "service": self.service_name,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        dd = {
            attr: value for attr in _DD_RECORD_ATTRS
            if (value := getattr(record, f"dd.{attr}", "")) not in ("", "0")
        }
        if "trace_id" in dd:  # service/env/version alone aren't a correlation
            payload["dd"] = dd
        if record.exc_info:
            exc_type, exc, _ = record.exc_info
            payload["error"] = {
                "kind": exc_type.__name__ if exc_type else None,
                "message": str(exc) if exc else None,
                "stack": self.formatException(record.exc_info),
            }
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_json_logging(service_name: str) -> logging.Logger:
    """Configure root logging with a JSON line format and return this
    service's named logger. force=True so each service's own call wins
    regardless of import order (another module's basicConfig() elsewhere
    in the process would otherwise be a no-op here)."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter(service_name))
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    return logging.getLogger(service_name)
