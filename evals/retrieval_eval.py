"""Retrieval-quality eval (course milestone M8 - docs/ai-roadmap.md).

Answers the one question M8 exists for: does a learned embedding model
retrieve the right existing test case more often than the hashed
bag-of-words vector, on text that says the same thing in different words?

Unlike the other eval targets this involves no generation and no
sampling - embedding a fixed text is deterministic - so one pass per
provider is the whole measurement, and the report is a direct side-by-side.

Metrics per provider, over every query in evals/datasets/retrieval.json
(queries are ranked only against their own suite's corpus, the same scope
api/retrieval.py searches):
  recall@1, recall@3 - fraction of queries with a relevant case in the top k
  mrr                - mean reciprocal rank of the first relevant case

Usage:
    python -m evals.retrieval_eval                                  # hash only
    python -m evals.retrieval_eval --provider hash --provider ollama
    python -m evals.retrieval_eval --provider ollama --min-recall-at-3 0.8

Exits 1 if --min-recall-at-3 is given and any provider falls below it, and
1 if a requested provider fails outright (reported, never silently skipped).
"""
import argparse
import json
import sys
from pathlib import Path

from api.embeddings import cosine_similarity, embed_texts

DEFAULT_DATASET = Path(__file__).parent / "datasets" / "retrieval.json"


def _doc_text(doc: dict) -> str:
    # Same "title\ndescription" shape api/retrieval.py embeds.
    return f"{doc['title']}\n{doc.get('description') or ''}"


def evaluate_provider(dataset: dict, provider: str, model: str | None = None, host: str | None = None) -> dict:
    per_query = []
    model_id = None
    for suite in dataset["suites"]:
        corpus = suite["corpus"]
        docs = embed_texts([_doc_text(d) for d in corpus], provider=provider, model=model, host=host)
        queries = embed_texts([q["text"] for q in suite["queries"]], provider=provider, model=model, host=host)
        model_id = docs.model_id
        for query, q_vec in zip(suite["queries"], queries.vectors):
            ranked = sorted(
                zip((d["id"] for d in corpus), docs.vectors),
                key=lambda pair: cosine_similarity(q_vec, pair[1]),
                reverse=True,
            )
            ranked_ids = [doc_id for doc_id, _ in ranked]
            rank = next((i + 1 for i, doc_id in enumerate(ranked_ids) if doc_id in query["relevant"]), None)
            per_query.append({"id": query["id"], "rank": rank, "top3": ranked_ids[:3]})

    n = len(per_query)
    return {
        "model_id": model_id,
        "queries": n,
        "recall_at_1": round(sum(1 for q in per_query if q["rank"] == 1) / n, 3),
        "recall_at_3": round(sum(1 for q in per_query if q["rank"] and q["rank"] <= 3) / n, 3),
        "mrr": round(sum(1 / q["rank"] for q in per_query if q["rank"]) / n, 3),
        "per_query": per_query,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider", action="append", choices=["hash", "ollama", "voyage"],
                        help="Embedding provider to evaluate; repeat to compare (default: hash).")
    parser.add_argument("--model", default=None, help="Model name for non-hash providers (default: provider default).")
    parser.add_argument("--host", default=None, help="Ollama server URL (default: OLLAMA_HOST or localhost).")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--min-recall-at-3", type=float, default=None)
    parser.add_argument("--output", type=Path, default=None, help="Write the full JSON report here.")
    args = parser.parse_args(argv)

    dataset = json.loads(args.dataset.read_text())
    results, failed = {}, False
    for provider in args.provider or ["hash"]:
        try:
            results[provider] = evaluate_provider(
                dataset, provider, model=None if provider == "hash" else args.model, host=args.host)
        except Exception as exc:
            results[provider] = {"error": str(exc)}
            failed = True

    print(f"{'provider':<10} {'model':<28} {'R@1':>6} {'R@3':>6} {'MRR':>6}")
    for provider, r in results.items():
        if "error" in r:
            print(f"{provider:<10} ERROR: {r['error']}")
            continue
        print(f"{provider:<10} {r['model_id']:<28} {r['recall_at_1']:>6.3f} {r['recall_at_3']:>6.3f} {r['mrr']:>6.3f}")
        if args.min_recall_at_3 is not None and r["recall_at_3"] < args.min_recall_at_3:
            print(f"  below --min-recall-at-3 {args.min_recall_at_3}")
            failed = True

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(results, indent=2) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
