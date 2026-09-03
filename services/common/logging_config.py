"""Structured (JSON) logging, shared by every microservice.

Milestone 5 (GCP DevOps plan) calls for Cloud Logging to receive structured
entries so they show up with a parsed jsonPayload (severity, service name,
message) instead of an opaque text blob — mirrors api/main.py's own
logging.basicConfig format, applied once here instead of five times.
"""
import logging


def json_log_format(service_name: str) -> str:
    """The %-style logging format string for `service_name` — pulled out
    of configure_json_logging() so it's testable without touching global
    logging state."""
    return (
        '{"time":"%(asctime)s","level":"%(levelname)s",'
        f'"service":"{service_name}","msg":"%(message)s"}}'
    )


def configure_json_logging(service_name: str) -> logging.Logger:
    """Configure root logging with a JSON line format and return this
    service's named logger. force=True so each service's own call wins
    regardless of import order (another module's basicConfig() elsewhere
    in the process would otherwise be a no-op here)."""
    logging.basicConfig(
        level=logging.INFO,
        format=json_log_format(service_name),
        force=True,
    )
    return logging.getLogger(service_name)
