"""Tests for api/retrieval.py's nearest_test_cases() and
store_test_case_embedding() against the real (throwaway SQLite) DB used by
the rest of tests/api/ - see conftest.py."""
import pytest

from api import models
from api.retrieval import nearest_test_cases, store_test_case_embedding


@pytest.fixture()
def suite_id(auth_client):
    client, headers = auth_client
    p = client.post("/api/projects", json={"name": "Project"}, headers=headers).json()
    s = client.post(f"/api/projects/{p['id']}/suites", json={"name": "Suite"}, headers=headers).json()
    return s["id"]


def _db():
    from tests.api.conftest import TestingSessionLocal
    return TestingSessionLocal()


def _make_test_case(db, suite_id, title, description=""):
    tc = models.TestCase(suite_id=suite_id, title=title, description=description, status="draft")
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


def test_nearest_test_cases_returns_empty_list_for_a_suite_with_no_cases(suite_id):
    db = _db()
    try:
        assert nearest_test_cases(db, suite_id=suite_id, query_text="login") == []
    finally:
        db.close()


def test_nearest_test_cases_ranks_the_closer_match_first(suite_id):
    db = _db()
    try:
        login_case = _make_test_case(db, suite_id, "Login with valid credentials", "Verify login succeeds")
        kafka_case = _make_test_case(db, suite_id, "Kafka consumer lag delays delivery", "Check event lag")
        store_test_case_embedding(db, login_case)
        store_test_case_embedding(db, kafka_case)

        results = nearest_test_cases(db, suite_id=suite_id, query_text="user login with email and password", k=2)
        assert [tc.id for tc in results][0] == login_case.id
    finally:
        db.close()


def test_nearest_test_cases_lazily_backfills_missing_embeddings(suite_id):
    """A test case created without ever going through
    store_test_case_embedding() (e.g. the plain manual-create endpoint)
    must still be retrievable - nearest_test_cases() backfills it on read."""
    db = _db()
    try:
        tc = _make_test_case(db, suite_id, "Login with valid credentials", "Verify login succeeds")
        assert db.query(models.TestCaseEmbedding).filter(
            models.TestCaseEmbedding.test_case_id == tc.id
        ).first() is None

        results = nearest_test_cases(db, suite_id=suite_id, query_text="login", k=5)

        assert [r.id for r in results] == [tc.id]
        assert db.query(models.TestCaseEmbedding).filter(
            models.TestCaseEmbedding.test_case_id == tc.id
        ).first() is not None
    finally:
        db.close()


def test_nearest_test_cases_respects_k(suite_id):
    db = _db()
    try:
        for i in range(5):
            case = _make_test_case(db, suite_id, f"Case {i}", f"Description {i}")
            store_test_case_embedding(db, case)
        results = nearest_test_cases(db, suite_id=suite_id, query_text="case", k=3)
        assert len(results) == 3
    finally:
        db.close()


def test_store_test_case_embedding_upserts_rather_than_duplicating(suite_id):
    db = _db()
    try:
        tc = _make_test_case(db, suite_id, "Login", "")
        store_test_case_embedding(db, tc)
        store_test_case_embedding(db, tc)
        rows = db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.test_case_id == tc.id).all()
        assert len(rows) == 1
    finally:
        db.close()
