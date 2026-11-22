"""The monolith (api/) and the microservices (services/) are two deployments
of the same domain: services/ is the monolith decomposed per bounded context
(services/README.md, "Monolith vs microservices"). The gateway puts them
behind the same URLs, so a client must not be able to tell which one it is
talking to.

This contract test keeps the two from drifting apart: for every operation
both expose (same path + method), the success status, the response schema
and the request body schema must match. A route that exists on only one
side is allowed (the services expose health probes, the monolith the
demo/portfolio extras); a route that exists on both and disagrees is not.
"""
import importlib
import os
import sys
import tempfile

import pytest

from api.main import app as monolith_app

SERVICES = ["auth", "projects", "runs", "ai"]
# Lower bound, so the test cannot pass vacuously if a refactor renames paths
# on one side and the overlap quietly drops to zero. 31 shared at the time of
# writing; 32 with the ai service's generate endpoint.
MIN_SHARED_OPERATIONS = 31


def _service_openapi(service: str) -> dict:
    module = f"services.{service}.main"
    if module not in sys.modules:
        db_dir = tempfile.mkdtemp(prefix=f"parity_{service}_")
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = f"sqlite:///{db_dir}/main.db"
        try:
            importlib.import_module(module)
        finally:
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
    return sys.modules[module].app.openapi()


def _shape(operation: dict) -> dict:
    """The client-visible contract of one operation, by schema name."""
    def ref(schema: dict):
        if not schema:
            return None
        if schema.get("type") == "array":
            return ("array", schema.get("items", {}).get("$ref"))
        return schema.get("$ref") or schema.get("type")

    success = sorted(code for code in operation.get("responses", {}) if code.startswith("2"))
    body = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
    first = operation["responses"][success[0]] if success else {}
    response = first.get("content", {}).get("application/json", {}).get("schema")
    return {"success_status": success, "response": ref(response), "request_body": ref(body)}


def _shared_operations():
    mono = monolith_app.openapi()["paths"]
    for service in SERVICES:
        for path, methods in _service_openapi(service)["paths"].items():
            for method, operation in methods.items():
                if method in mono.get(path, {}):
                    yield service, method.upper(), path, mono[path][method], operation


SHARED = list(_shared_operations())


def test_the_two_deployments_still_overlap():
    assert len(SHARED) >= MIN_SHARED_OPERATIONS, (
        f"only {len(SHARED)} operations are shared between api/ and services/ — "
        "a route was renamed on one side only?"
    )


@pytest.mark.parametrize(
    "service,method,path,monolith_op,service_op",
    SHARED,
    ids=[f"{s}:{m} {p}" for s, m, p, _, _ in SHARED],
)
def test_shared_operation_has_the_same_contract(service, method, path, monolith_op, service_op):
    assert _shape(service_op) == _shape(monolith_op), (
        f"{method} {path}: services/{service} and the monolith disagree on the contract"
    )
