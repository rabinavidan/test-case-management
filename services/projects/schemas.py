"""Re-exports the schemas shared with the monolith — see shared/schemas.py
for what was unified and why.
"""
from shared.schemas import (
    ProjectCreate,
    ProjectResponse,
    PaginatedProjects,
    TestSuiteCreate,
    TestSuiteResponse,
    TestCaseCreate,
    TestCaseUpdate,
    TestCaseResponse,
    ProjectStats,
    RunDataPoint,
    ProjectAnalytics,
    AIGeneratedTestCase,
    AIDraftDecision,
    AIDraftReviewSubmit,
    AIDraftReviewResult,
    AIDraftReviewResponse,
)

__all__ = [
    "ProjectCreate", "ProjectResponse", "PaginatedProjects",
    "TestSuiteCreate", "TestSuiteResponse",
    "TestCaseCreate", "TestCaseUpdate", "TestCaseResponse",
    "ProjectStats", "RunDataPoint", "ProjectAnalytics",
    "AIGeneratedTestCase",
    "AIDraftDecision", "AIDraftReviewSubmit", "AIDraftReviewResult", "AIDraftReviewResponse",
]
