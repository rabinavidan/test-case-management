"""Contract test: the GraphQL schema the server builds must equal the
committed SDL in docs/schema.graphql — the GraphQL counterpart of
test_openapi_contract.py. A field renamed, removed or retyped in api/gql/
fails here, so a breaking change to clients is always a visible diff to
docs/schema.graphql in the same PR.

Regenerate after an intentional change:
    python -c "from api.gql import schema; print(schema.as_str())" > docs/schema.graphql
"""
import pathlib

from graphql import build_schema, find_breaking_changes

from api.gql import schema

SDL_PATH = pathlib.Path(__file__).resolve().parents[2] / "docs" / "schema.graphql"


def test_schema_matches_committed_sdl():
    committed = SDL_PATH.read_text().strip()
    assert schema.as_str().strip() == committed, (
        "GraphQL schema drifted from docs/schema.graphql — regenerate it (see this module's docstring)"
    )


def test_committed_sdl_is_valid_and_has_no_breaking_changes_vs_itself():
    """Sanity: the SDL parses, and graphql-core's breaking-change detector
    (the tool a CI gate against the previous release would use) runs on it."""
    committed = build_schema(SDL_PATH.read_text())
    assert find_breaking_changes(committed, build_schema(schema.as_str())) == []
