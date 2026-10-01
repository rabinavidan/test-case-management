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

Course milestone M8 (docs/ai-roadmap.md) put that seam to use:
embed_texts() routes to the provider named by EMBEDDING_PROVIDER -
"hash" (default, this module's own vector, unchanged), "ollama" (a local
learned model, nomic-embed-text by default), or "voyage" (a hosted
embeddings API, usable from Vercel where no local model runs). Every
batch carries a model_id, stored with each vector (api/retrieval.py), so
switching providers re-embeds stale rows instead of silently comparing
vectors from two different models. get_embedding() itself stays the
hashed vector: evals/scorers.py uses it as a fixed, deterministic
near-duplicate yardstick that must not move when production's retrieval
model does.
"""
import hashlib
import math
import os
import re
from dataclasses import dataclass

import httpx

EMBEDDING_DIM = 128
HASH_MODEL_ID = f"hash-bow-{EMBEDDING_DIM}"
DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text"
DEFAULT_VOYAGE_MODEL = "voyage-3-lite"
VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
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


@dataclass
class EmbeddingBatch:
    model_id: str
    vectors: list[list[float]]


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    return vector if norm == 0.0 else [v / norm for v in vector]


def current_embedding_model(provider: str | None = None, model: str | None = None) -> str:
    """The model_id embed_texts() would stamp on vectors right now - used by
    retrieval to spot rows embedded by a different model."""
    provider = (provider or os.getenv("EMBEDDING_PROVIDER") or "hash").lower()
    if provider == "hash":
        return HASH_MODEL_ID
    if provider == "ollama":
        return f"ollama:{model or os.getenv('EMBEDDING_MODEL') or DEFAULT_OLLAMA_EMBED_MODEL}"
    if provider == "voyage":
        return f"voyage:{model or os.getenv('EMBEDDING_MODEL') or DEFAULT_VOYAGE_MODEL}"
    raise ValueError(f"Unknown embedding provider: {provider!r}")


def embed_texts(texts: list[str], provider: str | None = None, model: str | None = None,
                host: str | None = None) -> EmbeddingBatch:
    """Embeds a batch with the configured provider; every vector is
    L2-normalized so cosine_similarity() stays a plain dot product for all
    providers. Raises on any provider failure - the caller decides whether
    to fall back (api/retrieval.py falls back to "hash" for the request)."""
    model_id = current_embedding_model(provider, model)
    if not texts:
        return EmbeddingBatch(model_id, [])
    backend, _, name = model_id.partition(":")
    if model_id == HASH_MODEL_ID:
        return EmbeddingBatch(model_id, [get_embedding(t) for t in texts])
    if backend == "ollama":
        url = f"{(host or os.getenv('OLLAMA_HOST') or 'http://localhost:11434').rstrip('/')}/api/embed"
        response = httpx.post(url, json={"model": name, "input": texts}, timeout=60)
        response.raise_for_status()
        vectors = response.json()["embeddings"]
    else:
        api_key = os.getenv("VOYAGE_API_KEY")
        if not api_key:
            raise RuntimeError("VOYAGE_API_KEY not configured")
        response = httpx.post(
            VOYAGE_API_URL, headers={"Authorization": f"Bearer {api_key}"},
            json={"model": name, "input": texts}, timeout=30,
        )
        response.raise_for_status()
        vectors = [row["embedding"] for row in sorted(response.json()["data"], key=lambda r: r["index"])]
    if len(vectors) != len(texts):
        raise RuntimeError(f"{model_id} returned {len(vectors)} vectors for {len(texts)} texts")
    return EmbeddingBatch(model_id, [_normalize([float(v) for v in vec]) for vec in vectors])
