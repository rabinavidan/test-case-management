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
import logging

from sqlalchemy.orm import Session

from . import models
from .embeddings import HASH_MODEL_ID, cosine_similarity, embed_texts

logger = logging.getLogger("testflow")


def _embedding_text(title: str, description: str | None) -> str:
    return f"{title}\n{description or ''}"


def _embed_with_fallback(texts: list[str]):
    """Embeds with the configured provider (api/embeddings.py, course
    milestone M8); if that provider fails, the whole batch falls back to
    the hashed vector so a model outage degrades retrieval quality rather
    than failing the request - and every vector in one comparison still
    comes from one model."""
    try:
        return embed_texts(texts)
    except Exception as exc:
        logger.warning(f"Embedding provider failed, falling back to {HASH_MODEL_ID}: {exc}")
        return embed_texts(texts, provider="hash")


def _upsert(db: Session, test_case: models.TestCase, vector: list[float], model_id: str,
            existing: models.TestCaseEmbedding | None) -> None:
    if existing:
        existing.embedding_json = _serialize(vector)
        existing.embedding_model = model_id
    else:
        db.add(models.TestCaseEmbedding(
            test_case_id=test_case.id,
            suite_id=test_case.suite_id,
            embedding_json=_serialize(vector),
            embedding_model=model_id,
        ))


def store_test_case_embedding(db: Session, test_case: models.TestCase) -> None:
    """Computes and upserts the embedding for one test case. Called after a
    test case is created (including AI-generated ones, once saved) so
    later retrieval always has it - a case never has to backfill itself the
    first time it's the one being searched from."""
    batch = _embed_with_fallback([_embedding_text(test_case.title, test_case.description)])
    existing = db.query(models.TestCaseEmbedding).filter(
        models.TestCaseEmbedding.test_case_id == test_case.id
    ).first()
    _upsert(db, test_case, batch.vectors[0], batch.model_id, existing)
    db.commit()


def _serialize(vector: list[float]) -> str:
    return json.dumps(vector)


def _deserialize(embedding_json: str) -> list[float]:
    return json.loads(embedding_json)


def nearest_test_cases(db: Session, suite_id: int, query_text: str, k: int = 5) -> list[models.TestCase]:
    """Returns up to k existing test cases in this suite most similar to
    query_text, nearest first.

    The query is embedded first; any test case whose stored vector is
    missing (created before M5, or via the plain manual-create endpoint) or
    was produced by a different model than the query's (a provider switch,
    or an earlier fallback to the hash vector) is re-embedded in one batch
    with that same model and written back - so vectors from two models are
    never compared, and a provider change converges the suite on first read.

    A pure-Python cosine-similarity scan, not a pgvector ANN query - see
    api/embeddings.py's docstring for why: at this app's scale (at most a
    few hundred test cases per suite) an exact scan is both simpler and, in
    practice, no slower than round-tripping to a server-side index."""
    test_cases = db.query(models.TestCase).filter(models.TestCase.suite_id == suite_id).all()
    if not test_cases:
        return []

    query = _embed_with_fallback([query_text])
    rows = {
        row.test_case_id: row
        for row in db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.suite_id == suite_id).all()
    }
    vectors: dict[int, list[float]] = {}
    stale: list[models.TestCase] = []
    for tc in test_cases:
        row = rows.get(tc.id)
        if row and (row.embedding_model or HASH_MODEL_ID) == query.model_id:
            vectors[tc.id] = _deserialize(row.embedding_json)
        else:
            stale.append(tc)

    if stale:
        try:
            batch = embed_texts([_embedding_text(tc.title, tc.description) for tc in stale],
                                provider="hash" if query.model_id == HASH_MODEL_ID else None)
            if batch.model_id != query.model_id:
                raise RuntimeError(f"provider changed mid-request ({batch.model_id} != {query.model_id})")
        except Exception as exc:
            # The provider answered for the query but not the backfill: redo
            # the whole comparison on the hash vector rather than mix models.
            logger.warning(f"Embedding backfill failed, ranking with {HASH_MODEL_ID}: {exc}")
            return _rank_with_hash(db, test_cases, rows, query_text, k)
        for tc, vector in zip(stale, batch.vectors):
            _upsert(db, tc, vector, batch.model_id, rows.get(tc.id))
            vectors[tc.id] = vector
        db.commit()

    return sorted(test_cases, key=lambda tc: cosine_similarity(query.vectors[0], vectors[tc.id]), reverse=True)[:k]


def _rank_with_hash(db, test_cases, rows, query_text, k):
    hashed = embed_texts([query_text] + [_embedding_text(tc.title, tc.description) for tc in test_cases],
                         provider="hash").vectors
    query_vector, case_vectors = hashed[0], dict(zip((tc.id for tc in test_cases), hashed[1:]))
    return sorted(test_cases, key=lambda tc: cosine_similarity(query_vector, case_vectors[tc.id]), reverse=True)[:k]
