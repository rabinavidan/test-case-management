from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
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
    created_at: datetime
    model_config = {"from_attributes": True}


class TestCaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    status: str = "draft"
    priority: str = "medium"


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
    created_at: datetime
    model_config = {"from_attributes": True}


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
    created_at: datetime
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


class AIGeneratedTestCase(BaseModel):
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    priority: str = "medium"
