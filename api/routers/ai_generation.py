"""AI test-case generation (grounded on similar existing cases) and saving the drafts."""
import json
import logging
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import ai_gateway, ai_review, models, schemas
from ..ai_prompts import (
    TESTCASE_GENERATION_GROUNDED_SYSTEM_PROMPT,
    TESTCASE_GENERATION_SYSTEM_PROMPT,
    build_grounded_testcase_generation_user_prompt,
    build_testcase_generation_user_prompt,
    parse_testcase_generation_response,
    prompt_version,
)
from ..auth import require_admin
from ..database import get_db
from ..retrieval import nearest_test_cases, store_test_case_embedding

logger = logging.getLogger("testflow")
router = APIRouter()


# ─── AI Test Case Generation ──────────────────────────────────────────────────

@router.post("/api/suites/{suite_id}/testcases/generate", response_model=schemas.AIGenerateResponse)
def generate_testcases(
    suite_id: int,
    payload: schemas.AIGenerateRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    provider = os.getenv("AI_PROVIDER", "anthropic")
    model = os.getenv("AI_MODEL", "claude-haiku-4-5-20251001")
    if not ai_gateway.is_configured(provider):
        raise HTTPException(
            status_code=503,
            detail=f"AI generation unavailable: {provider} not configured",
        )

    # M9 feedback loop: drafts reviewers rejected in this suite, with reasons.
    rejections = ai_review.recent_rejections(db, suite_id)
    if payload.grounded:
        similar_cases = nearest_test_cases(db, suite_id=suite_id, query_text=payload.feature_description)
        system_prompt = TESTCASE_GENERATION_GROUNDED_SYSTEM_PROMPT
        user_prompt = build_grounded_testcase_generation_user_prompt(
            suite_name=suite.name,
            feature_description=payload.feature_description,
            count=payload.count,
            similar_cases=[{"title": tc.title, "description": tc.description} for tc in similar_cases],
            rejections=rejections,
        )
    else:
        system_prompt = TESTCASE_GENERATION_SYSTEM_PROMPT
        user_prompt = build_testcase_generation_user_prompt(
            suite_name=suite.name,
            feature_description=payload.feature_description,
            count=payload.count,
            rejections=rejections,
        )

    result = ai_gateway.complete(
        system_prompt, user_prompt, provider=provider, model=model, max_tokens=2048,
    )
    ai_gateway.log_ai_call(result, feature="test_generation")
    if result.outcome == "error":
        logger.error(f"AI generation error: {result.error}")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {result.error}")

    try:
        test_cases = parse_testcase_generation_response(result.text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON; try again")

    logger.info(f"AI generated {len(test_cases)} test cases for suite={suite_id}")
    generation_id = uuid.uuid4().hex
    ai_review.record_generation(
        db, generation_id=generation_id, suite=suite, feature_description=payload.feature_description,
        count=payload.count, grounded=bool(payload.grounded), model=result.model,
        prompt_version=prompt_version(system_prompt),
    )
    return schemas.AIGenerateResponse(
        test_cases=[schemas.AIGeneratedTestCase(**tc) for tc in test_cases],
        model=result.model,
        generation_id=generation_id,
    )


@router.post("/api/suites/{suite_id}/testcases/generate/save")
def save_generated_testcases(
    suite_id: int,
    payload: List[schemas.AIGeneratedTestCase],
    generation_id: Optional[str] = Query(None, max_length=36),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Bulk-save AI-generated test cases to a suite as drafts, each with a
    pending human review (M9 — see api/ai_review.py). Pass the generate
    call's generation_id so the reviews can be exported as eval cases."""
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    created = []
    for tc in payload:
        obj = models.TestCase(suite_id=suite_id, status="draft", **tc.model_dump())
        db.add(obj)
        created.append(obj)
    db.commit()
    for obj in created:
        db.refresh(obj)
        store_test_case_embedding(db, obj)
    review_ids = ai_review.record_drafts(db, suite_id, generation_id, created)
    logger.info(f"Saved {len(created)} AI-generated test cases to suite={suite_id}")
    return {"saved": len(created), "review_ids": review_ids}
