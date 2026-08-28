"""Pydantic schemas shared between the monolith (api/) and the microservices
(services/*). Both stacks model the same domain (users, projects, suites,
test cases, runs, AI generation) and had drifted into near-duplicate copies
of the same request/response shapes — see api/schemas.py and each
services/*/schemas.py before this module existed.

Two real bugs were found while comparing the copies field-by-field, both
now fixed by having one definition instead of several:

- `UTCDatetime` (the fix for naive-datetime responses violating OpenAPI's
  `format: date-time`, originally added to api/schemas.py alone after
  tests/contract/ caught it) was never applied to services/auth,
  services/projects, or services/runs — their schemas used plain
  `datetime` and had the same bug, just never caught, because nothing runs
  an equivalent contract-test suite against the microservices deployment
  yet. Every response datetime here now goes through it.
- `TokenResponse` in api/schemas.py includes `token_type: str = "bearer"`;
  services/auth's copy didn't declare the field at all, so the
  microservices auth endpoint's responses were silently missing it.

A handful of fields differed only in strictness — e.g. `TestCaseCreate`'s
`status`/`priority` were `Optional[str] = "draft"/"medium"` in api/schemas.py
but non-Optional `str = "draft"/"medium"` in services/projects/schemas.py
(rejecting an explicit `null` that the monolith accepted). Where a copy was
strictly more lenient than the other, this module adopts the more lenient
one: that only *widens* what's accepted (or what an optional response field
may be), so it can't turn a previously-valid request or response invalid.

Not everything duplicated here: `TestResultResponse` and `TestRunResponse`
differ between api/schemas.py and services/runs/schemas.py by more than
strictness — the monolith's versions carry a nested `test_case`/`run_id`
and a resolved `created_by_username` that the runs service alone can't
produce (that data lives in the projects/auth services in microservices
mode). Those stay defined per-stack rather than forced into one shape.
"""
from pydantic import BaseModel, Field, PlainSerializer, WithJsonSchema
from typing import Annotated, Optional, List
from datetime import datetime, timezone


def _as_utc_isoformat(dt: datetime) -> str:
    """Serialize with an explicit UTC offset. Naive datetimes (as produced by
    `datetime.utcnow()`, used throughout every service's models) render
    without a timezone designator by default — technically violating
    OpenAPI's `format: date-time` (RFC 3339 requires one)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# `WithJsonSchema` is required here, not decorative: without it, PlainSerializer
# makes Pydantic emit a bare `{"type": "string"}` for this field in openapi.json —
# silently dropping `format: date-time` and weakening the very contract the
# serializer above exists to satisfy.
UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_as_utc_isoformat, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]


# ─── Auth ───────────────────────────────────────────────────────────────────

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

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Projects / suites / test cases ────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class PaginatedProjects(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TestSuiteCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TestSuiteResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str]
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


# ─── Runs (fields shared with the monolith only — see module docstring) ────

class TestRunCreate(BaseModel):
    name: str
    environment_key: Optional[str] = None


# ─── Environments — staging/regression/preprod/prod, each pinned to its own
# Kubernetes node (see k8s/). Monolith-only for now: the microservices split
# has no environments table or endpoint yet. ───────────────────────────────

class EnvironmentResponse(BaseModel):
    id: int
    key: str
    name: str
    tier: int
    namespace: str
    node_name: str
    region: str
    status: str
    pods_ready: int
    pods_desired: int
    cpu_pct: float
    mem_pct: float
    uptime_seconds: int

    model_config = {"from_attributes": True}


class TestResultUpdate(BaseModel):
    status: str  # pass, fail, skip
    notes: Optional[str] = None


# ─── Contact Us — public, unauthenticated (monolith only) ──────────────────

class ContactCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=255)
    phone: str = Field(..., min_length=1, max_length=30)
    description: str = Field(..., min_length=1, max_length=500)


# ─── Log Center — admin-only viewer over server/client activity (monolith
# only). Client error reports (POST /api/logs/client) are public, since a
# logged-out visitor's browser can hit an error too. ────────────────────────

class LogEntryResponse(BaseModel):
    id: int
    created_at: UTCDatetime
    level: str
    source: str
    message: str
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[int] = None
    extra: Optional[str] = None

    model_config = {"from_attributes": True}


class ClientLogCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    stack: Optional[str] = Field(None, max_length=2000)
    url: Optional[str] = Field(None, max_length=500)


# ─── Stats / analytics ──────────────────────────────────────────────────────

class ProjectStats(BaseModel):
    total_suites: int
    total_cases: int
    total_runs: int
    last_run_pass: int
    last_run_fail: int
    last_run_skip: int
    last_run_pending: int
    last_run_name: Optional[str]


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


# ─── AI generation ──────────────────────────────────────────────────────────

class AIGenerateRequest(BaseModel):
    feature_description: str
    count: Optional[int] = 5


class AIGeneratedTestCase(BaseModel):
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    priority: str = "medium"


class AIGenerateResponse(BaseModel):
    test_cases: List[AIGeneratedTestCase]
    model: str


# ─── AI failure triage ───────────────────────────────────────────────────────

class TriageResultItem(BaseModel):
    testcase_id: int
    title: str
    status: str
    notes: Optional[str] = None


class TriageResponse(BaseModel):
    summary: str
    problem_results: List[TriageResultItem] = []
    model: Optional[str] = None


# ─── Flaky test detection ────────────────────────────────────────────────────

class FlakyTestCase(BaseModel):
    testcase_id: int
    title: str
    executions: int
    flip_count: int
    flakiness_score: float
    history: List[str]


class FlakyTestsResponse(BaseModel):
    suite_id: int
    flaky_cases: List[FlakyTestCase]
