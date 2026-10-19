"""Monolith-specific schemas. Everything duplicated (with equivalent or
looser validation) across services/*/schemas.py now lives in
shared/schemas.py and is re-exported here — see that module's docstring
for what was unified and why. `TestResultResponse` and `TestRunResponse`
stay defined here because they carry data (a nested `test_case`, resolved
`created_by_username`) that only the monolith's single shared database can
produce in one query; the runs microservice's equivalents are intentionally
narrower (see services/runs/schemas.py).
"""
from typing import Literal, Optional, List

from shared.schemas import (
    UTCDatetime,
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    ProjectCreate,
    ProjectResponse,
    PaginatedProjects,
    TestSuiteCreate,
    TestSuiteResponse,
    TestCaseCreate,
    TestCaseUpdate,
    TestCaseResponse,
    TestRunCreate,
    TestResultUpdate,
    ProjectStats,
    RunDataPoint,
    ProjectAnalytics,
    AIGenerateRequest,
    AIGeneratedTestCase,
    AIGenerateResponse,
    TriageResultItem,
    TriageResponse,
    TriageToolCall,
    TriageVerdict,
    FlakyTestCase,
    FlakyTestsResponse,
    EnvironmentResponse,
    ContactCreate,
    LogEntryResponse,
    ClientLogCreate,
    PaginatedLogs,
)
from pydantic import BaseModel, Field, model_validator

# ─── Human review of AI drafts (course milestone M9, monolith only) ──────────

class AIDraftEdits(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None


class AIDraftReviewDecision(BaseModel):
    verdict: Literal["accepted", "edited", "rejected"]
    reason: Optional[str] = Field(None, max_length=1000)
    edits: Optional[AIDraftEdits] = None

    @model_validator(mode="after")
    def _check_verdict_fields(self):
        if self.verdict == "rejected" and not (self.reason or "").strip():
            raise ValueError("A rejection needs a reason — it becomes the eval case's label")
        if self.verdict == "edited" and (
            self.edits is None or not self.edits.model_dump(exclude_none=True)
        ):
            raise ValueError("An 'edited' verdict needs at least one edited field")
        return self


class AIDraftReviewResponse(BaseModel):
    id: int
    suite_id: int
    test_case_id: Optional[int]
    generation_id: Optional[str]
    feature_description: Optional[str]
    model: Optional[str]
    original: AIGeneratedTestCase
    edited: Optional[AIGeneratedTestCase]
    verdict: str
    reason: Optional[str]
    reviewed_by_username: Optional[str]
    reviewed_at: Optional[UTCDatetime]
    created_at: UTCDatetime


class ReviewedEvalCase(BaseModel):
    """One evals/datasets/test_generation_reviewed.json case — see
    scripts/export_review_dataset.py."""
    id: str
    source: str = "human_review"
    suite_name: str
    feature_description: str
    count: int
    model: str
    prompt_version: str
    accepted_titles: List[str]
    rejected: List[dict]
    edits: List[dict]


class ReviewedEvalExport(BaseModel):
    cases: List[ReviewedEvalCase]


__all__ = [
    "UTCDatetime", "UserRegister", "UserLogin", "UserResponse", "TokenResponse",
    "ProjectCreate", "ProjectResponse", "PaginatedProjects",
    "TestSuiteCreate", "TestSuiteResponse",
    "TestCaseCreate", "TestCaseUpdate", "TestCaseResponse",
    "TestRunCreate", "TestResultUpdate", "TestResultResponse", "TestRunResponse",
    "ProjectStats", "RunDataPoint", "ProjectAnalytics",
    "AIGenerateRequest", "AIGeneratedTestCase", "AIGenerateResponse",
    "TriageResultItem", "TriageResponse", "TriageToolCall", "TriageVerdict",
    "FlakyTestCase", "FlakyTestsResponse",
    "EnvironmentResponse",
    "ContactCreate",
    "LogEntryResponse",
    "ClientLogCreate",
    "PaginatedLogs",
    "AIDraftEdits", "AIDraftReviewDecision", "AIDraftReviewResponse",
    "ReviewedEvalCase", "ReviewedEvalExport",
]


class TestResultResponse(BaseModel):
    id: int
    run_id: int
    testcase_id: int
    status: str
    notes: Optional[str]
    executed_at: Optional[UTCDatetime]
    test_case: TestCaseResponse

    model_config = {"from_attributes": True}


class TestRunResponse(BaseModel):
    id: int
    suite_id: int
    name: str
    created_at: UTCDatetime
    completed_at: Optional[UTCDatetime]
    created_by_username: Optional[str] = None
    environment_key: Optional[str] = None
    environment_name: Optional[str] = None
    results: List[TestResultResponse] = []

    model_config = {"from_attributes": True}
