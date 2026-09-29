"""Request-scoped DataLoaders: every `suite.testCases` (etc.) requested
while resolving one level of a query is collected and fetched with a single
`WHERE ... IN (...)`, instead of one query per parent row (N+1).
tests/api/test_graphql.py counts the SQL statements to hold this."""
from collections import defaultdict
from typing import Callable, Dict, List, Sequence

from sqlalchemy.orm import Session
from strawberry.dataloader import DataLoader

from .. import models


def _grouped(db: Session, model, fk, order_by) -> Callable:
    async def load(keys: Sequence[int]) -> List[list]:
        rows = db.query(model).filter(fk.in_(keys)).order_by(order_by).all()
        by_key: Dict[int, list] = defaultdict(list)
        for row in rows:
            by_key[getattr(row, fk.key)].append(row)
        return [by_key.get(k, []) for k in keys]
    return load


def _by_id(db: Session, model) -> Callable:
    async def load(keys: Sequence[int]) -> list:
        rows = {row.id: row for row in db.query(model).filter(model.id.in_(keys)).all()}
        return [rows.get(k) for k in keys]
    return load


class Loaders:
    def __init__(self, db: Session):
        m = models
        self.project = DataLoader(_by_id(db, m.Project))
        self.suite = DataLoader(_by_id(db, m.TestSuite))
        self.test_case = DataLoader(_by_id(db, m.TestCase))
        self.user = DataLoader(_by_id(db, m.User))
        self.environment = DataLoader(_by_id(db, m.Environment))
        # Same ordering as the equivalent REST list endpoints.
        self.suites_by_project = DataLoader(
            _grouped(db, m.TestSuite, m.TestSuite.project_id, m.TestSuite.created_at.desc()))
        self.test_cases_by_suite = DataLoader(
            _grouped(db, m.TestCase, m.TestCase.suite_id, m.TestCase.created_at.desc()))
        self.runs_by_suite = DataLoader(
            _grouped(db, m.TestRun, m.TestRun.suite_id, m.TestRun.created_at.desc()))
        self.results_by_run = DataLoader(
            _grouped(db, m.TestResult, m.TestResult.run_id, m.TestResult.id))
