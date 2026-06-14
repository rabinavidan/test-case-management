from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


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
    created_at: datetime

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
    created_at: datetime

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
    created_at: datetime

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
    created_at: datetime

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
    executed_at: Optional[datetime]
    test_case: TestCaseResponse

    class Config:
        from_attributes = True


class TestRunResponse(BaseModel):
    id: int
    suite_id: int
    name: str
    created_at: datetime
    completed_at: Optional[datetime]
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
