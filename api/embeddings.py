"""Text embeddings for retrieval-grounded AI Test Generation (course
milestone M5 — see evals/README.md's "Retrieval-grounded generation"
section for the eval proof this exists to back up).

Deliberately a hashed bag-of-words embedding, not a learned model or a call
to an external embeddings API. pgvector plus a hosted/local embeddings
model was the first design considered (see the plan this milestone came
from), but two things ruled it out here: this app's Vercel/Neon production
deployment has no reachable local model service (Ollama is only available
in dev/CI, the same limitation the eval harness already lives with), and a
paid hosted embeddings call on every test-case write would be a real,
ongoing cost for a portfolio app with at most a few hundred test cases per
suite — a scale where an application-side cosine-similarity scan over a
JSON-encoded vector column is exact, not approximate, and fast enough that
pgvector's ANN index buys nothing measurable. get_embedding() is the one
seam a real embedding model would replace later without any caller change
if the app's scale or budget ever justified it.
"""
import hashlib
import math
import re

EMBEDDING_DIM = 128
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def get_embedding(text: str) -> list[float]:
    """Hashes each token into one of EMBEDDING_DIM buckets and counts
    occurrences, then L2-normalizes - a classic hashing-trick bag-of-words
    vector. Deterministic: the same text always produces the same vector, so
    it's safe to compute once at write time and compare against later
    without re-hashing history. All-zero (never normalized) for text with no
    tokens."""
    vector = [0.0] * EMBEDDING_DIM
    for token in _tokenize(text):
        bucket = int(hashlib.blake2b(token.encode(), digest_size=4).hexdigest(), 16) % EMBEDDING_DIM
        vector[bucket] += 1.0
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0.0:
        return vector
    return [v / norm for v in vector]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Both vectors are already L2-normalized by get_embedding(), so the dot
    product alone is the cosine similarity."""
    return sum(x * y for x, y in zip(a, b))
