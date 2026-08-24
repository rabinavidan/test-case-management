from pydantic import BaseModel, PlainSerializer, WithJsonSchema
from typing import Annotated, Optional, List
from datetime import datetime, timezone


def _as_utc_isoformat(dt: datetime) -> str:
    """Serialize with an explicit UTC offset. `datetime.utcnow()` (used throughout
    api/models.py) produces naive datetimes, which Pydantic renders without a
    timezone designator — technically violating OpenAPI's `format: date-time`
    (RFC 3339 requires one). Caught by the contract test suite (tests/contract/),
    which fuzzes real responses against the app's own OpenAPI schema.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# `WithJsonSchema` is required here, not decorative: without it, PlainSerializer
# makes Pydantic emit a bare `{"type": "string"}` for this field in openapi.json —
# silently dropping `format: date-time` and weakening the very contract the
# serializer above exists to satisfy. The TypeScript contract suite (e2e/tests/
# contract.spec.ts), which validates responses with ajv-formats' strict
# `date-time` check straight from the schema, is what caught this.
UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_as_utc_isoformat, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]


# Auth schemas
class UserRegister(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool = True
    created_at: UTCDatetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Project schemas
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: UTCDatetime

    class Config:
        from_attributes = True


# TestSuite schemas
class TestSuiteCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TestSuiteResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str]
    created_at: UTCDatetime

    class Config:
        from_attributes = True


# TestCase schemas
class TestCaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    status: Optional[str] = "draft"
    priority: Optional[str] = "medium"


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None


class TestCaseResponse(BaseModel):
    id: int
    suite_id: int
    title: str
    description: Optional[str]
    steps: Optional[str]
    expected_result: Optional[str]
    status: str
    priority: str
    created_at: UTCDatetime

    class Config:
        from_attributes = True


# TestRun schemas
class TestRunCreate(BaseModel):
    name: str


class TestResultResponse(BaseModel):
    id: int
    run_id: int
    testcase_id: int
    status: str
    notes: Optional[str]
    executed_at: Optional[UTCDatetime]
    test_case: TestCaseResponse

    class Config:
        from_attributes = True


class TestRunResponse(BaseModel):
    id: int
    suite_id: int
    name: str
    created_at: UTCDatetime
    completed_at: Optional[UTCDatetime]
    created_by_username: Optional[str] = None
    results: List[TestResultResponse] = []

    @classmethod
    def from_orm_with_user(cls, run):
        obj = cls.model_validate(run)
        obj.created_by_username = run.created_by.username if run.created_by else None
        return obj

    class Config:
        from_attributes = True


# TestResult update
class TestResultUpdate(BaseModel):
    status: str  # pass, fail, skip
    notes: Optional[str] = None


# Stats schema
class ProjectStats(BaseModel):
    total_suites: int
    total_cases: int
    total_runs: int
    last_run_pass: int
    last_run_fail: int
    last_run_skip: int
    last_run_pending: int
    last_run_name: Optional[str]


# AI generation schemas
class AIGenerateRequest(BaseModel):
    feature_description: str
    count: Optional[int] = 5


class AIGeneratedTestCase(BaseModel):
    title: str
    description: str
    steps: str
    expected_result: str
    priority: str


class AIGenerateResponse(BaseModel):
    test_cases: List[AIGeneratedTestCase]
    model: str


# Analytics schemas
class RunDataPoint(BaseModel):
    run_name: str
    created_at: UTCDatetime
    pass_count: int
    fail_count: int
    skip_count: int
    total: int
    pass_rate: float


class ProjectAnalytics(BaseModel):
    project_id: int
    project_name: str
    run_history: List[RunDataPoint]
    suite_coverage: List[dict]


# Pagination
class PaginatedProjects(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
