"""Unit tests for api/embeddings.py — the hashed bag-of-words embedding
used to ground AI Test Generation. Pure functions, no DB or network."""
from api.embeddings import EMBEDDING_DIM, cosine_similarity, get_embedding


def test_get_embedding_returns_a_vector_of_the_fixed_dimension():
    vector = get_embedding("login with valid credentials")
    assert len(vector) == EMBEDDING_DIM


def test_get_embedding_is_deterministic():
    assert get_embedding("login flow") == get_embedding("login flow")


def test_get_embedding_is_l2_normalized_for_nonempty_text():
    vector = get_embedding("some feature description with several words")
    norm = sum(v * v for v in vector) ** 0.5
    assert abs(norm - 1.0) < 1e-9


def test_get_embedding_of_empty_text_is_all_zero():
    assert get_embedding("") == [0.0] * EMBEDDING_DIM
    assert get_embedding("   ") == [0.0] * EMBEDDING_DIM


def test_get_embedding_ignores_case_and_punctuation():
    assert get_embedding("Login, Password!") == get_embedding("login password")


def test_cosine_similarity_of_identical_text_is_one():
    vector = get_embedding("user login with email and password")
    assert abs(cosine_similarity(vector, vector) - 1.0) < 1e-9


def test_cosine_similarity_of_unrelated_text_is_low():
    a = get_embedding("user login with email and password")
    b = get_embedding("kafka consumer lag delays event delivery")
    assert cosine_similarity(a, b) < 0.3


def test_cosine_similarity_of_near_duplicate_titles_is_high():
    a = get_embedding("Login with valid credentials succeeds")
    b = get_embedding("Successful login with valid credentials")
    assert cosine_similarity(a, b) > 0.7


def test_cosine_similarity_of_orthogonal_zero_vectors_is_zero():
    zero = [0.0] * EMBEDDING_DIM
    assert cosine_similarity(zero, zero) == 0.0


# ─── Pluggable providers (course milestone M8) ───────────────────────────────

import httpx  # noqa: E402
import pytest  # noqa: E402

from api import embeddings  # noqa: E402


def test_default_provider_is_the_hash_vector(monkeypatch):
    monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
    batch = embeddings.embed_texts(["login flow"])
    assert batch.model_id == embeddings.HASH_MODEL_ID
    assert batch.vectors == [get_embedding("login flow")]


def test_current_embedding_model_names_provider_and_model(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
    monkeypatch.delenv("EMBEDDING_MODEL", raising=False)
    assert embeddings.current_embedding_model() == "ollama:nomic-embed-text"
    monkeypatch.setenv("EMBEDDING_MODEL", "mxbai-embed-large")
    assert embeddings.current_embedding_model() == "ollama:mxbai-embed-large"
    assert embeddings.current_embedding_model("voyage", "voyage-3") == "voyage:voyage-3"
    with pytest.raises(ValueError):
        embeddings.current_embedding_model("nope")


def test_ollama_provider_batches_and_normalizes(monkeypatch):
    seen = {}

    def fake_post(url, json, timeout):
        seen.update(url=url, body=json)
        return httpx.Response(200, json={"embeddings": [[3.0, 4.0], [0.0, 2.0]]},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    batch = embeddings.embed_texts(["a", "b"], provider="ollama", host="http://ollama:11434/")
    assert seen["url"] == "http://ollama:11434/api/embed"
    assert seen["body"] == {"model": "nomic-embed-text", "input": ["a", "b"]}
    assert batch.model_id == "ollama:nomic-embed-text"
    assert batch.vectors == [[0.6, 0.8], [0.0, 1.0]]


def test_voyage_provider_requires_key_and_orders_by_index(monkeypatch):
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY"):
        embeddings.embed_texts(["a"], provider="voyage")

    monkeypatch.setenv("VOYAGE_API_KEY", "k")
    monkeypatch.setattr(embeddings.httpx, "post", lambda url, headers, json, timeout: httpx.Response(
        200, json={"data": [{"index": 1, "embedding": [0, 1]}, {"index": 0, "embedding": [1, 0]}]},
        request=httpx.Request("POST", url)))
    batch = embeddings.embed_texts(["first", "second"], provider="voyage")
    assert batch.model_id == "voyage:voyage-3-lite"
    assert batch.vectors == [[1.0, 0.0], [0.0, 1.0]]


def test_provider_returning_wrong_vector_count_raises(monkeypatch):
    monkeypatch.setattr(embeddings.httpx, "post", lambda url, json, timeout: httpx.Response(
        200, json={"embeddings": [[1.0]]}, request=httpx.Request("POST", url)))
    with pytest.raises(RuntimeError, match="1 vectors for 2 texts"):
        embeddings.embed_texts(["a", "b"], provider="ollama")
