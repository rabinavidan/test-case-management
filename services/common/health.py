"""Standard `/health` response shape — was copy-pasted verbatim (with just
the service name changed) into every services/*/main.py.
"""


def health_response(service_name: str) -> dict:
    return {"status": "ok", "service": service_name}
