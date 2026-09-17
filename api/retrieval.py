"""Retrieval for grounding AI Test Generation against existing test cases in
the same suite (course milestone M5). See api/embeddings.py for the
embedding itself and evals/README.md's "Retrieval-grounded generation"
section for the eval that measures the win this is meant to produce: fewer
generated test cases that duplicate one already in the suite.

Deliberately scoped to the monolith (api/) for this milestone: the
microservices `services/ai/` variant has no direct database access to test
cases (it calls the `projects` service over HTTP for suite metadata only),
so grounding it would mean adding a new internal test-case-listing endpoint
and a new service-to-service dependency purely for this feature — a
larger, separate change than this milestone's effort budget, and left for
a future one.
"""
import json

from sqlalchemy.orm import Session

from . import models
from .embeddings import cosine_similarity, get_embedding


def _embedding_text(title: str, description: str | None) -> str:
    return f"{title}\n{description or ''}"


def store_test_case_embedding(db: Session, test_case: models.TestCase) -> None:
    """Computes and upserts the embedding for one test case. Called after a
    test case is created (including AI-generated ones, once saved) so
    later retrieval always has it - a case never has to backfill itself the
    first time it's the one being searched from."""
    text = _embedding_text(test_case.title, test_case.description)
    embedding_json = _serialize(get_embedding(text))

    existing = db.query(models.TestCaseEmbedding).filter(
        models.TestCaseEmbedding.test_case_id == test_case.id
    ).first()
    if existing:
        existing.embedding_json = embedding_json
    else:
        db.add(models.TestCaseEmbedding(
            test_case_id=test_case.id,
            suite_id=test_case.suite_id,
            embedding_json=embedding_json,
        ))
    db.commit()


def _serialize(vector: list[float]) -> str:
    return json.dumps(vector)


def _deserialize(embedding_json: str) -> list[float]:
    return json.loads(embedding_json)


def nearest_test_cases(db: Session, suite_id: int, query_text: str, k: int = 5) -> list[models.TestCase]:
    """Returns up to k existing test cases in this suite most similar to
    query_text, nearest first. Any test case in the suite missing an
    embedding row (created before this feature, or never explicitly
    generated-and-saved through store_test_case_embedding) is lazily
    backfilled here so retrieval quality doesn't depend on when a case was
    created.

    A pure-Python cosine-similarity scan, not a pgvector ANN query - see
    api/embeddings.py's docstring for why: at this app's scale (at most a
    few hundred test cases per suite) an exact scan is both simpler and, in
    practice, no slower than round-tripping to a server-side index."""
    test_cases = db.query(models.TestCase).filter(models.TestCase.suite_id == suite_id).all()
    if not test_cases:
        return []

    embeddings_by_case_id = {
        row.test_case_id: _deserialize(row.embedding_json)
        for row in db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.suite_id == suite_id).all()
    }
    for tc in test_cases:
        if tc.id not in embeddings_by_case_id:
            store_test_case_embedding(db, tc)
            embeddings_by_case_id[tc.id] = _deserialize(
                db.query(models.TestCaseEmbedding)
                .filter(models.TestCaseEmbedding.test_case_id == tc.id)
                .first()
                .embedding_json
            )

    query_embedding = get_embedding(query_text)
    scored = sorted(
        test_cases,
        key=lambda tc: cosine_similarity(query_embedding, embeddings_by_case_id[tc.id]),
        reverse=True,
    )
    return scored[:k]
