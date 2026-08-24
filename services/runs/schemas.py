"""`TestRunCreate` and `TestResultUpdate` are shared with the monolith — see
shared/schemas.py. `TestResultResponse` and `TestRunResponse` stay defined
here: the monolith's versions carry a nested `test_case` (with `run_id`)
and a resolved `created_by_username` that this service alone can't produce
in microservices mode (that data lives in the projects/auth services
respectively) — see shared/schemas.py's module docstring for the full
reasoning.
"""
from typing import Optional, List

from shared.schemas import TestRunCreate, TestResultUpdate, UTCDatetime
from pydantic import BaseModel

__all__ = ["TestRunCreate", "TestResultUpdate", "TestResultResponse", "TestRunResponse"]


class TestResultResponse(BaseModel):
    id: int
    testcase_id: int
    status: str
    notes: Optional[str]
    executed_at: Optional[UTCDatetime]
    model_config = {"from_attributes": True}


class TestRunResponse(BaseModel):
    id: int
    suite_id: int
    name: str
    created_at: UTCDatetime
    completed_at: Optional[UTCDatetime]
    results: List[TestResultResponse] = []
    model_config = {"from_attributes": True}
