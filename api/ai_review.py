"""Human review of AI-generated drafts (course milestone M9).

AI Test Generation saves its output as `draft` test cases. This module adds
the step the roadmap called for: a reviewer accepts, edits or rejects each
draft (a rejection must say why), the verdict is recorded per draft, and
reviewed drafts are exported as eval cases so human judgement flows back
into the eval harness:

    generate (api/main.py) -> save as drafts -> review here
        -> GET /api/ai-reviews/export -> scripts/export_review_dataset.py
        -> evals/datasets/test_generation_reviewed.json
        -> evals/targets/test_generation_reviewed.py (rejected_repeat_rate)

The same rejections are also fed into the next generation prompt for the
suite (`recent_rejections`, used by api/main.py's generate_testcases), so a
reviewer's "no" changes what the model is asked — and the eval target checks
that the change actually stops the repeat.
"""
import json
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from . import models, schemas
from .auth import get_current_user, require_admin
from .database import get_db

router = APIRouter()

# How many past rejections a generation prompt carries. Enough to steer the
# model away from what reviewers keep rejecting without crowding out the
# feature description.
MAX_PROMPT_REJECTIONS = 5

_EDITABLE_FIELDS = ("title", "description", "steps", "expected_result", "priority")


def record_generation(db: Session, *, generation_id: str, suite: models.TestSuite, feature_description: str,
                      count: int, grounded: bool, model: str, prompt_version: str) -> None:
    db.add(models.AIGeneration(
        id=generation_id, suite_id=suite.id, suite_name=suite.name,
        feature_description=feature_description, requested_count=count,
        grounded=grounded, model=model, prompt_version=prompt_version,
    ))
    db.commit()


def record_drafts(db: Session, suite_id: int, generation_id: Optional[str],
                  saved: List[models.TestCase]) -> List[int]:
    """One pending review per saved draft. An unknown generation_id (or none,
    from an older client) still gets reviews — they just can't be exported
    as eval cases, since the prompt inputs aren't known."""
    if generation_id and not db.query(models.AIGeneration).filter(
        models.AIGeneration.id == generation_id, models.AIGeneration.suite_id == suite_id,
    ).first():
        generation_id = None
    reviews = []
    for tc in saved:
        review = models.AIDraftReview(
            generation_id=generation_id, suite_id=suite_id, test_case_id=tc.id,
            original_json=json.dumps(_snapshot(tc)),
        )
        db.add(review)
        reviews.append(review)
    db.commit()
    return [r.id for r in reviews]


def recent_rejections(db: Session, suite_id: int, limit: int = MAX_PROMPT_REJECTIONS) -> List[dict]:
    rows = db.query(models.AIDraftReview).filter(
        models.AIDraftReview.suite_id == suite_id,
        models.AIDraftReview.verdict == "rejected",
    ).order_by(models.AIDraftReview.reviewed_at.desc(), models.AIDraftReview.id.desc()).limit(limit).all()
    return [{"title": json.loads(r.original_json).get("title", ""), "reason": r.reason or ""} for r in rows]


def _snapshot(tc: models.TestCase) -> dict:
    return {
        "title": tc.title, "description": tc.description, "steps": tc.steps,
        "expected_result": tc.expected_result, "priority": tc.priority or "medium",
    }


def _to_response(review: models.AIDraftReview) -> schemas.AIDraftReviewResponse:
    generation = review.generation
    return schemas.AIDraftReviewResponse(
        id=review.id, suite_id=review.suite_id, test_case_id=review.test_case_id,
        generation_id=review.generation_id,
        feature_description=generation.feature_description if generation else None,
        model=generation.model if generation else None,
        original=schemas.AIGeneratedTestCase(**json.loads(review.original_json)),
        edited=schemas.AIGeneratedTestCase(**json.loads(review.edited_json)) if review.edited_json else None,
        verdict=review.verdict, reason=review.reason,
        reviewed_by_username=review.reviewed_by.username if review.reviewed_by else None,
        reviewed_at=review.reviewed_at, created_at=review.created_at,
    )


@router.get("/api/suites/{suite_id}/ai-reviews", response_model=List[schemas.AIDraftReviewResponse])
def list_reviews(
    suite_id: int,
    verdict: Optional[str] = Query(None, pattern="^(pending|accepted|edited|rejected)$"),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    if not db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first():
        raise HTTPException(status_code=404, detail="Suite not found")
    q = db.query(models.AIDraftReview).filter(models.AIDraftReview.suite_id == suite_id)
    if verdict:
        q = q.filter(models.AIDraftReview.verdict == verdict)
    return [_to_response(r) for r in q.order_by(models.AIDraftReview.id).all()]


@router.post("/api/ai-reviews/{review_id}", response_model=schemas.AIDraftReviewResponse)
def review_draft(
    review_id: int,
    decision: schemas.AIDraftReviewDecision,
    db: Session = Depends(get_db),
    reviewer: models.User = Depends(require_admin),
):
    review = db.query(models.AIDraftReview).filter(models.AIDraftReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.verdict != "pending":
        raise HTTPException(status_code=409, detail=f"Draft already reviewed ({review.verdict})")

    tc = None
    if review.test_case_id is not None:
        tc = db.query(models.TestCase).filter(models.TestCase.id == review.test_case_id).first()
    if tc is None and decision.verdict != "rejected":
        raise HTTPException(status_code=409, detail="The draft's test case no longer exists; it can only be rejected")

    if decision.verdict in ("accepted", "edited"):
        if decision.verdict == "edited":
            for field, value in decision.edits.model_dump(exclude_none=True).items():
                setattr(tc, field, value)
            review.edited_json = json.dumps(_snapshot(tc))
        tc.status = "active"
    elif tc is not None:
        # A rejected draft leaves the suite, including its retrieval embedding,
        # so it can't ground (or be "already covered" for) a later generation.
        db.query(models.TestCaseEmbedding).filter(models.TestCaseEmbedding.test_case_id == tc.id).delete()
        db.delete(tc)
        review.test_case_id = None

    review.verdict = decision.verdict
    review.reason = (decision.reason or "").strip() or None
    review.reviewed_by_id = reviewer.id
    review.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(review)
    return _to_response(review)


def build_export(db: Session) -> schemas.ReviewedEvalExport:
    """Reviewed drafts grouped into one eval case per generation call.
    Generations whose drafts are all still pending are skipped — there is
    no human signal in them yet."""
    by_generation = defaultdict(list)
    for review in db.query(models.AIDraftReview).filter(
        models.AIDraftReview.generation_id.isnot(None),
        models.AIDraftReview.verdict != "pending",
    ).order_by(models.AIDraftReview.id).all():
        by_generation[review.generation_id].append(review)

    cases = []
    for generation_id, reviews in by_generation.items():
        generation = reviews[0].generation
        accepted, rejected, edits = [], [], []
        for r in reviews:
            original = json.loads(r.original_json)
            if r.verdict == "rejected":
                rejected.append({"title": original["title"], "reason": r.reason})
            elif r.verdict == "edited":
                after = json.loads(r.edited_json)
                accepted.append(after["title"])
                changed = {f: after[f] for f in _EDITABLE_FIELDS if after.get(f) != original.get(f)}
                edits.append({"before": original, "after": after, "changed": sorted(changed)})
            else:
                accepted.append(original["title"])
        cases.append(schemas.ReviewedEvalCase(
            id=f"review-{generation_id[:8]}",
            suite_name=generation.suite_name,
            feature_description=generation.feature_description,
            count=generation.requested_count,
            model=generation.model,
            prompt_version=generation.prompt_version,
            accepted_titles=accepted, rejected=rejected, edits=edits,
        ))
    return schemas.ReviewedEvalExport(cases=cases)


@router.get("/api/ai-reviews/export", response_model=schemas.ReviewedEvalExport)
def export_reviews(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return build_export(db)
