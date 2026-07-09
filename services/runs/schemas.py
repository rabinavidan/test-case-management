from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TestResultResponse(BaseModel):
    id: int
    testcase_id: int
    status: str
    notes: Optional[str]
    executed_at: Optional[datetime]
    model_config = {"from_attributes": True}


class TestRunCreate(BaseModel):
    name: str


class TestRunResponse(BaseModel):
    id: int
    suite_id: int
    name: str
    created_at: datetime
    completed_at: Optional[datetime]
    results: List[TestResultResponse] = []
    model_config = {"from_attributes": True}


class TestResultUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
