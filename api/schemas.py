"""Monolith-specific schemas. Everything duplicated (with equivalent or
looser validation) across services/*/schemas.py now lives in
shared/schemas.py and is re-exported here — see that module's docstring
for what was unified and why. `TestResultResponse` and `TestRunResponse`
stay defined here because they carry data (a nested `test_case`, resolved
`created_by_username`) that only the monolith's single shared database can
produce in one query; the runs microservice's equivalents are intentionally
narrower (see services/runs/schemas.py).
"""
from typing import Optional, List

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
    FlakyTestCase,
    FlakyTestsResponse,
)
from pydantic import BaseModel

__all__ = [
    "UTCDatetime", "UserRegister", "UserLogin", "UserResponse", "TokenResponse",
    "ProjectCreate", "ProjectResponse", "PaginatedProjects",
    "TestSuiteCreate", "TestSuiteResponse",
    "TestCaseCreate", "TestCaseUpdate", "TestCaseResponse",
    "TestRunCreate", "TestResultUpdate", "TestResultResponse", "TestRunResponse",
    "ProjectStats", "RunDataPoint", "ProjectAnalytics",
    "AIGenerateRequest", "AIGeneratedTestCase", "AIGenerateResponse",
    "TriageResultItem", "TriageResponse",
    "FlakyTestCase", "FlakyTestsResponse",
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
    results: List[TestResultResponse] = []

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_user(cls, run):
        obj = cls.model_validate(run)
        obj.created_by_username = run.created_by.username if run.created_by else None
        return obj
