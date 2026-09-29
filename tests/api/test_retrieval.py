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


# ─── Model-aware re-embedding and fallback (course milestone M8) ─────────────

import httpx  # noqa: E402

from api import embeddings  # noqa: E402

# A tiny stand-in "learned" model: it knows "sign-in" and "login" mean the
# same thing, which the hashed bag-of-words vector cannot.
_CONCEPTS = [("login", "sign-in", "sign in", "log in"), ("kafka", "event", "consumer")]


def _fake_semantic_post(url, json, timeout):
    vectors = [[float(any(w in t.lower() for w in words)) for words in _CONCEPTS] + [0.01]
               for t in json["input"]]
    return httpx.Response(200, json={"embeddings": vectors}, request=httpx.Request("POST", url))


def _rows(db, suite_id):
    return db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.suite_id == suite_id).all()


def test_store_records_which_model_produced_the_vector(suite_id, monkeypatch):
    monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
    db = _db()
    try:
        tc = _make_test_case(db, suite_id, "Login with valid credentials")
        store_test_case_embedding(db, tc)
        assert _rows(db, suite_id)[0].embedding_model == embeddings.HASH_MODEL_ID
    finally:
        db.close()


def test_switching_provider_reembeds_stale_rows_and_finds_paraphrases(suite_id, monkeypatch):
    db = _db()
    try:
        monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
        login = _make_test_case(db, suite_id, "Login with valid credentials", "User logs in")
        kafka = _make_test_case(db, suite_id, "Kafka consumer lag delays delivery")
        store_test_case_embedding(db, login)
        store_test_case_embedding(db, kafka)

        monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
        monkeypatch.setattr(embeddings.httpx, "post", _fake_semantic_post)
        results = nearest_test_cases(db, suite_id=suite_id, query_text="Sign-in fails for a locked account", k=2)

        assert results[0].id == login.id
        assert {r.embedding_model for r in _rows(db, suite_id)} == {"ollama:nomic-embed-text"}
    finally:
        db.close()


def test_legacy_rows_without_a_model_are_treated_as_hash(suite_id, monkeypatch):
    """Rows written before M8 have embedding_model NULL; under the default
    provider they're reused as-is, not re-embedded."""
    monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
    db = _db()
    try:
        tc = _make_test_case(db, suite_id, "Login with valid credentials")
        store_test_case_embedding(db, tc)
        row = _rows(db, suite_id)[0]
        row.embedding_model = None
        row.embedding_json = "[1.0]"  # sentinel: a re-embed would overwrite it
        db.commit()

        assert [r.id for r in nearest_test_cases(db, suite_id=suite_id, query_text="login", k=1)] == [tc.id]
        db.refresh(row)
        assert row.embedding_model is None
        assert row.embedding_json == "[1.0]"
    finally:
        db.close()


def test_provider_outage_falls_back_to_hash_without_mixing_models(suite_id, monkeypatch):
    db = _db()
    try:
        login = _make_test_case(db, suite_id, "Login with valid credentials", "user login")
        _make_test_case(db, suite_id, "Kafka consumer lag delays delivery")

        def down(url, json, timeout):
            raise httpx.ConnectError("ollama unreachable")

        monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
        monkeypatch.setattr(embeddings.httpx, "post", down)
        results = nearest_test_cases(db, suite_id=suite_id, query_text="user login with password", k=1)

        assert results[0].id == login.id
        assert {r.embedding_model for r in _rows(db, suite_id)} == {embeddings.HASH_MODEL_ID}
    finally:
        db.close()


def test_backfill_failure_after_query_success_ranks_with_hash(suite_id, monkeypatch):
    """The provider embeds the query, then fails on the backfill batch: the
    whole comparison is redone on the hash vector rather than comparing a
    learned query vector against hashed case vectors."""
    db = _db()
    try:
        login = _make_test_case(db, suite_id, "Login with valid credentials", "user login")
        _make_test_case(db, suite_id, "Kafka consumer lag delays delivery")
        calls = []

        def flaky(url, json, timeout):
            calls.append(len(json["input"]))
            if len(calls) > 1:
                raise httpx.ReadTimeout("timed out")
            return _fake_semantic_post(url, json, timeout)

        monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
        monkeypatch.setattr(embeddings.httpx, "post", flaky)
        results = nearest_test_cases(db, suite_id=suite_id, query_text="user login with password", k=1)

        assert calls == [1, 2]
        assert results[0].id == login.id
        assert _rows(db, suite_id) == []  # nothing half-written
    finally:
        db.close()
