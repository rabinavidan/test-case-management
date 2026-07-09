from pydantic import BaseModel
from typing import Optional, List


class AIGenerateRequest(BaseModel):
    feature_description: str
    count: int = 5


class AIGeneratedTestCase(BaseModel):
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    priority: str = "medium"


class AIGenerateResponse(BaseModel):
    test_cases: List[AIGeneratedTestCase]
    model: str
