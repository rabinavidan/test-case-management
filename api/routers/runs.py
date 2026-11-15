"""Test runs: create, record results, AI triage, and the live-collaboration WebSocket."""
import logging
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from shared import ws_protocol

from .. import ai_gateway, models, schemas
from ..ai_prompts import (
    TRIAGE_SYSTEM_PROMPT,
    build_triage_user_prompt,
)
from ..auth import _decode_token, get_current_user, require_admin
from ..database import get_db
from ..realtime import ws_manager
from ..triage_agent import (
    collect_evidence,
    collect_problems,
    heuristic_verdict,
    run_triage_agent,
)

logger = logging.getLogger("testflow")
router = APIRouter()


# ─── Test Runs ────────────────────────────────────────────────────────────────

@router.post("/api/suites/{suite_id}/runs", response_model=schemas.TestRunResponse, status_code=201)
def create_run(suite_id: int, payload: schemas.TestRunCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")

    environment_id = None
    if payload.environment_key:
        environment = db.query(models.Environment).filter(
            models.Environment.key == payload.environment_key
        ).first()
        if not environment:
            raise HTTPException(status_code=400, detail="Unknown environment")
        environment_id = environment.id

    run = models.TestRun(
        suite_id=suite_id, name=payload.name, created_by_id=current_user.id,
        environment_id=environment_id,
    )
    db.add(run)
    db.flush()

    # Create pending results for all active test cases
    test_cases = db.query(models.TestCase).filter(
        models.TestCase.suite_id == suite_id,
        models.TestCase.status == "active"
    ).all()

    for tc in test_cases:
        result = models.TestResult(run_id=run.id, testcase_id=tc.id, status="pending")
        db.add(result)

    db.commit()
    db.refresh(run)
    return run


@router.get("/api/suites/{suite_id}/runs", response_model=List[schemas.TestRunResponse])
def list_runs(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return db.query(models.TestRun).filter(
        models.TestRun.suite_id == suite_id
    ).order_by(models.TestRun.created_at.desc()).all()


@router.get("/api/runs/{run_id}", response_model=schemas.TestRunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def _apply_result_update(run_id: int, tc_id: int, payload: schemas.TestResultUpdate, db: Session):
    result = db.query(models.TestResult).filter(
        models.TestResult.run_id == run_id,
        models.TestResult.testcase_id == tc_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result.status = payload.status
    result.notes = payload.notes
    result.executed_at = datetime.utcnow()

    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    all_results = db.query(models.TestResult).filter(models.TestResult.run_id == run_id).all()
    run_completed = all(r.status != "pending" for r in all_results)
    if run_completed:
        run.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)
    return result, run_completed


# The handler is async only to await the broadcast; its DB work runs in the
# threadpool. Blocking DB calls on the event loop deadlock the server when the
# pool is busy: they wait for a connection that the requests holding them
# need this same loop to give back (tests/backend/api/test_event_loop_db.py).
@router.put("/api/runs/{run_id}/results/{tc_id}")
async def update_result(run_id: int, tc_id: int, payload: schemas.TestResultUpdate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    result, run_completed = await run_in_threadpool(_apply_result_update, run_id, tc_id, payload, db)

    # Broadcast live update to all WebSocket subscribers on this run
    await ws_manager.broadcast(run_id, {
        "type": "result_updated",
        "testcase_id": tc_id,
        "status": result.status,
        "notes": result.notes,
        "updated_by": current.username,
        "run_completed": run_completed,
    })

    return {"id": result.id, "status": result.status, "notes": result.notes}


@router.post("/api/runs/{run_id}/triage", response_model=schemas.TriageResponse)
def triage_run(
    run_id: int,
    agentic: bool = False,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """AI-powered failure triage: summarizes a run's failed/skipped results into a
    plain-English root-cause guess, using the same Claude Haiku client as AI test
    generation. With ?agentic=true (course milestone M7) the model can call
    read-only tools - case history, similar cases, suite flakiness - before
    diagnosing; see api/triage_agent.py. Anthropic-only: other providers fall
    back to the single-shot call and report mode="single_shot".

    Every failing case also gets a structured verdict (product_bug / flaky /
    environment / unknown): the agent's, recorded through its record_verdict
    tool, cross-checked against a deterministic heuristic over the same
    evidence. Single-shot mode returns the heuristic verdicts alone."""
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    problems = collect_problems(db, run)
    if not problems:
        return schemas.TriageResponse(
            summary="No failed or skipped results in this run — nothing to triage.",
        )

    provider = os.getenv("AI_PROVIDER", "anthropic")
    model = os.getenv("AI_MODEL", "claude-haiku-4-5-20251001")
    if not ai_gateway.is_configured(provider):
        raise HTTPException(
            status_code=503,
            detail=f"AI triage unavailable: {provider} not configured",
        )

    problem_items = [schemas.TriageResultItem(testcase_id=p["testcase_id"], title=p["title"],
                                              status=p["status"], notes=p["notes"]) for p in problems]
    lines = [p["line"] for p in problems]

    failing_ids = [p["testcase_id"] for p in problems if p["status"] == "fail"]
    titles = {item.testcase_id: item.title for item in problem_items}

    def build_verdicts(agent_verdicts: dict | None) -> list:
        verdicts = []
        for tid in failing_ids:
            h_verdict, h_evidence = heuristic_verdict(collect_evidence(db, run, tid))
            agent = (agent_verdicts or {}).get(tid)
            if agent_verdicts is None:
                needs_review = h_verdict == "unknown"
            else:
                needs_review = (agent is None or agent["verdict"] == "unknown"
                                or agent["verdict"] != h_verdict)
            verdicts.append(schemas.TriageVerdict(
                testcase_id=tid, title=titles[tid],
                verdict=agent["verdict"] if agent else h_verdict,
                agent_verdict=agent["verdict"] if agent else None,
                agent_evidence=agent["evidence"] if agent else None,
                heuristic_verdict=h_verdict, heuristic_evidence=h_evidence,
                needs_human_review=needs_review,
            ))
        return verdicts

    if agentic and provider == "anthropic":
        loop, agent_verdicts = run_triage_agent(db, run, problems, model=model)
        ai_gateway.log_ai_call(loop.call, feature="triage_agentic")
        if loop.call.outcome == "error":
            logger.error(f"AI agentic triage error: {loop.call.error}")
            raise HTTPException(status_code=502, detail=f"AI triage failed: {loop.call.error}")
        logger.info(f"AI agentic triage for run={run_id}: {len(loop.tool_calls)} tool calls, {loop.iterations} turns")
        return schemas.TriageResponse(
            summary=loop.call.text,
            problem_results=problem_items,
            model=loop.call.model,
            mode="agentic",
            tool_calls=[schemas.TriageToolCall(**vars(tc)) for tc in loop.tool_calls],
            hit_iteration_cap=loop.hit_iteration_cap,
            verdicts=build_verdicts(agent_verdicts),
        )

    user_prompt = build_triage_user_prompt(run.name, lines)
    result = ai_gateway.complete(
        TRIAGE_SYSTEM_PROMPT, user_prompt, provider=provider, model=model, max_tokens=512,
    )
    ai_gateway.log_ai_call(result, feature="triage")
    if result.outcome == "error":
        logger.error(f"AI triage error: {result.error}")
        raise HTTPException(status_code=502, detail=f"AI triage failed: {result.error}")

    summary = result.text.strip()
    logger.info(f"AI triage generated for run={run_id} ({len(problems)} problem results)")
    return schemas.TriageResponse(summary=summary, problem_results=problem_items, model=result.model,
                                  verdicts=build_verdicts(None))


# ─── WebSocket: live run collaboration ────────────────────────────────────────

@router.websocket("/ws/runs/{run_id}")
async def run_websocket(
    run_id: int,
    ws: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    # Protocol, close codes and why we accept-then-close: shared/ws_protocol.py
    await ws.accept()

    def admit():
        # In the threadpool, not on the event loop (see update_result).
        user = None
        if token:
            try:
                data = _decode_token(token)
                user = db.query(models.User).filter(models.User.id == int(data["sub"])).first()
            except HTTPException:
                user = None
        if user is None:
            return ws_protocol.CLOSE_UNAUTHORIZED, "Not authenticated"
        if not db.query(models.TestRun).filter(models.TestRun.id == run_id).first():
            return ws_protocol.CLOSE_RUN_NOT_FOUND, "Run not found"
        # Don't pin a pooled DB connection for the socket's whole lifetime.
        db.close()
        return None

    refused = await run_in_threadpool(admit)
    if refused:
        await ws.close(code=refused[0], reason=refused[1])
        return

    ws_manager.join(run_id, ws)
    await ws.send_text(ws_protocol.subscribed_message(run_id))
    try:
        while True:
            reply = ws_protocol.reply_to(await ws.receive_text())
            if reply is not None:
                await ws.send_text(reply)
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, ws)
        logger.info(f"WS disconnected run={run_id}")
