"""GraphQL API for the monolith, mounted at `/graphql` (see api/main.py).

A second, read-optimised front door onto the same data the REST API
serves — nested reads (`project { suites { testCases } }`) in one round
trip, batched with DataLoaders so they stay O(1) queries per nesting level
instead of N+1. Writes delegate to the REST handlers in api/main.py rather
than re-implementing them, so both APIs share one set of business rules.

Monolith-only for now, like the AI gateway: services/* has no GraphQL
endpoint; the microservices gateway proxy comes with subscriptions.
Schema contract: docs/schema.graphql (enforced by
tests/contract/test_graphql_schema.py).
"""
from .graph import graphql_router, schema

__all__ = ["graphql_router", "schema"]
