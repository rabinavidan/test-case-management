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
