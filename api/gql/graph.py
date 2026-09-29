"""GraphQL schema: types, queries, mutations, and the FastAPI router.

Design choices worth knowing before changing this file:

- Every operation requires a bearer token (same `Authorization` header as
  REST). Writes that REST restricts to admins are admin-only here too;
  they call the REST handler itself, so a rule changed there applies here.
- Output `status`/`priority` fields are plain strings, not enums: REST
  stores whatever string it was given, and one odd row mustn't make every
  GraphQL read of it fail. Inputs *are* enums, so GraphQL writes are
  validated before they reach the database.
- Subscriptions (`runUpdates`) run over graphql-transport-ws on the same
  `/graphql` path; the token goes in the connection_init payload.
- Guardrails against expensive queries (depth, aliases, tokens) always on;
  introspection and the GraphiQL IDE are off in production.
"""
import inspect
import os
from datetime import datetime, timezone
from enum import Enum
from typing import AsyncGenerator, List, Optional

import strawberry
from fastapi import HTTPException
from graphql import GraphQLError
from strawberry.extensions import (
    DisableIntrospection,
    MaskErrors,
    MaxAliasesLimiter,
    MaxTokensLimiter,
    QueryDepthLimiter,
)
from strawberry.fastapi import GraphQLRouter
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL
from strawberry.types import Info

from .. import models, schemas
from .context import Context, get_context, graphql_error

MAX_DEPTH = 10
MAX_ALIASES = 15
MAX_TOKENS = 2000
MAX_PAGE_SIZE = 100


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Naive UTC datetimes (the models use datetime.utcnow) get an explicit
    offset — same fix as shared.schemas.UTCDatetime for REST."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _call_rest(handler, *args):
    """Run a REST handler from api/main.py, translating its HTTPException
    into a GraphQL error with a matching `extensions.code`."""
    try:
        result = handler(*args)
        if inspect.isawaitable(result):
            result = await result
        return result
    except HTTPException as exc:
        raise graphql_error(exc.status_code, str(exc.detail))


def _rest():
    # Imported lazily: api.main imports this package to mount the router.
    from .. import main
    return main


# ─── Enums (inputs) ──────────────────────────────────────────────────────────

@strawberry.enum
class TestCaseStatus(Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


@strawberry.enum
class Priority(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@strawberry.enum
class ResultStatus(Enum):
    PENDING = "pending"
    PASS = "pass"
    FAIL = "fail"
    SKIP = "skip"


# ─── Types ───────────────────────────────────────────────────────────────────

@strawberry.type
class User:
    id: strawberry.ID
    username: str
    role: str

    @staticmethod
    def from_model(u: models.User) -> "User":
        return User(id=strawberry.ID(str(u.id)), username=u.username, role=u.role)


@strawberry.type
class Project:
    id: strawberry.ID
    name: str
    description: Optional[str]
    created_at: datetime

    @strawberry.field
    async def suites(self, info: Info[Context, None]) -> List["Suite"]:
        rows = await info.context.loaders.suites_by_project.load(int(self.id))
        return [Suite.from_model(s) for s in rows]

    @staticmethod
    def from_model(p: models.Project) -> "Project":
        return Project(id=strawberry.ID(str(p.id)), name=p.name, description=p.description,
                       created_at=_utc(p.created_at))


@strawberry.type
class Suite:
    id: strawberry.ID
    name: str
    description: Optional[str]
    created_at: datetime
    project_id: strawberry.ID

    @strawberry.field
    async def project(self, info: Info[Context, None]) -> Project:
        return Project.from_model(await info.context.loaders.project.load(int(self.project_id)))

    @strawberry.field
    async def test_cases(self, info: Info[Context, None], status: Optional[TestCaseStatus] = None) -> List["TestCase"]:
        rows = await info.context.loaders.test_cases_by_suite.load(int(self.id))
        if status is not None:
            rows = [r for r in rows if r.status == status.value]
        return [TestCase.from_model(tc) for tc in rows]

    @strawberry.field
    async def runs(self, info: Info[Context, None]) -> List["Run"]:
        rows = await info.context.loaders.runs_by_suite.load(int(self.id))
        return [Run.from_model(r) for r in rows]

    @staticmethod
    def from_model(s: models.TestSuite) -> "Suite":
        return Suite(id=strawberry.ID(str(s.id)), name=s.name, description=s.description,
                     created_at=_utc(s.created_at), project_id=strawberry.ID(str(s.project_id)))


@strawberry.type
class TestCase:
    id: strawberry.ID
    title: str
    description: Optional[str]
    steps: Optional[str]
    expected_result: Optional[str]
    status: str = strawberry.field(description="draft | active | deprecated")
    priority: str = strawberry.field(description="low | medium | high | critical")
    created_at: datetime
    suite_id: strawberry.ID

    @strawberry.field
    async def suite(self, info: Info[Context, None]) -> Suite:
        return Suite.from_model(await info.context.loaders.suite.load(int(self.suite_id)))

    @staticmethod
    def from_model(tc: models.TestCase) -> "TestCase":
        return TestCase(
            id=strawberry.ID(str(tc.id)), title=tc.title, description=tc.description, steps=tc.steps,
            expected_result=tc.expected_result, status=tc.status, priority=tc.priority,
            created_at=_utc(tc.created_at), suite_id=strawberry.ID(str(tc.suite_id)),
        )


@strawberry.type
class TestResult:
    id: strawberry.ID
    status: str = strawberry.field(description="pending | pass | fail | skip")
    notes: Optional[str]
    executed_at: Optional[datetime]
    run_id: strawberry.ID
    test_case_id: strawberry.ID

    @strawberry.field
    async def test_case(self, info: Info[Context, None]) -> TestCase:
        return TestCase.from_model(await info.context.loaders.test_case.load(int(self.test_case_id)))

    @staticmethod
    def from_model(r: models.TestResult) -> "TestResult":
        return TestResult(
            id=strawberry.ID(str(r.id)), status=r.status, notes=r.notes, executed_at=_utc(r.executed_at),
            run_id=strawberry.ID(str(r.run_id)), test_case_id=strawberry.ID(str(r.testcase_id)),
        )


@strawberry.type
class RunSummary:
    total: int
    passed: int
    failed: int
    skipped: int
    pending: int

    @strawberry.field(description="passed / (total - pending), 0-100; null until something has executed")
    def pass_rate(self) -> Optional[float]:
        executed = self.total - self.pending
        return round(100 * self.passed / executed, 1) if executed else None


@strawberry.type
class Run:
    id: strawberry.ID
    name: str
    created_at: datetime
    completed_at: Optional[datetime]
    suite_id: strawberry.ID
    created_by_id: strawberry.Private[Optional[int]]
    environment_id: strawberry.Private[Optional[int]]

    @strawberry.field
    async def suite(self, info: Info[Context, None]) -> Suite:
        return Suite.from_model(await info.context.loaders.suite.load(int(self.suite_id)))

    @strawberry.field
    async def created_by(self, info: Info[Context, None]) -> Optional[User]:
        if self.created_by_id is None:
            return None
        user = await info.context.loaders.user.load(self.created_by_id)
        return User.from_model(user) if user else None

    @strawberry.field
    async def environment_key(self, info: Info[Context, None]) -> Optional[str]:
        if self.environment_id is None:
            return None
        env = await info.context.loaders.environment.load(self.environment_id)
        return env.key if env else None

    @strawberry.field
    async def results(self, info: Info[Context, None], status: Optional[ResultStatus] = None) -> List[TestResult]:
        rows = await info.context.loaders.results_by_run.load(int(self.id))
        if status is not None:
            rows = [r for r in rows if r.status == status.value]
        return [TestResult.from_model(r) for r in rows]

    @strawberry.field
    async def summary(self, info: Info[Context, None]) -> RunSummary:
        rows = await info.context.loaders.results_by_run.load(int(self.id))
        count = lambda s: sum(1 for r in rows if r.status == s)  # noqa: E731
        return RunSummary(total=len(rows), passed=count("pass"), failed=count("fail"),
                          skipped=count("skip"), pending=count("pending"))

    @staticmethod
    def from_model(r: models.TestRun) -> "Run":
        return Run(
            id=strawberry.ID(str(r.id)), name=r.name, created_at=_utc(r.created_at),
            completed_at=_utc(r.completed_at), suite_id=strawberry.ID(str(r.suite_id)),
            created_by_id=r.created_by_id,
            environment_id=r.environment_id,
        )


# ─── Inputs ──────────────────────────────────────────────────────────────────

@strawberry.input
class ProjectInput:
    name: str
    description: Optional[str] = None


@strawberry.input
class SuiteInput:
    name: str
    description: Optional[str] = None


@strawberry.input
class TestCaseInput:
    title: str
    description: Optional[str] = None
    steps: Optional[str] = None
    expected_result: Optional[str] = None
    status: TestCaseStatus = TestCaseStatus.DRAFT
    priority: Priority = Priority.MEDIUM


@strawberry.input(description="Only the fields present are changed.")
class TestCaseUpdateInput:
    title: Optional[str] = strawberry.UNSET
    description: Optional[str] = strawberry.UNSET
    steps: Optional[str] = strawberry.UNSET
    expected_result: Optional[str] = strawberry.UNSET
    status: Optional[TestCaseStatus] = strawberry.UNSET
    priority: Optional[Priority] = strawberry.UNSET


@strawberry.input
class RunInput:
    name: str
    environment_key: Optional[str] = None


@strawberry.input
class ResultInput:
    status: ResultStatus
    notes: Optional[str] = None


# ─── Root types ──────────────────────────────────────────────────────────────

def _get(db, model, id_: strawberry.ID):
    try:
        pk = int(id_)
    except (TypeError, ValueError):
        return None
    return db.query(model).filter(model.id == pk).first()


@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: Info[Context, None]) -> User:
        return User.from_model(info.context.require_user())

    @strawberry.field(description=f"Newest first. `limit` is capped at {MAX_PAGE_SIZE}.")
    def projects(
        self, info: Info[Context, None], search: Optional[str] = None, limit: int = 20, offset: int = 0,
    ) -> List[Project]:
        info.context.require_user()
        if limit < 1 or offset < 0:
            raise graphql_error(400, "limit must be >= 1 and offset >= 0")
        q = info.context.db.query(models.Project)
        if search:
            q = q.filter(models.Project.name.ilike(f"%{search}%"))
        rows = q.order_by(models.Project.created_at.desc(), models.Project.id.desc()) \
                .offset(offset).limit(min(limit, MAX_PAGE_SIZE)).all()
        return [Project.from_model(p) for p in rows]

    @strawberry.field
    def project(self, info: Info[Context, None], id: strawberry.ID) -> Optional[Project]:
        info.context.require_user()
        row = _get(info.context.db, models.Project, id)
        return Project.from_model(row) if row else None

    @strawberry.field
    def suite(self, info: Info[Context, None], id: strawberry.ID) -> Optional[Suite]:
        info.context.require_user()
        row = _get(info.context.db, models.TestSuite, id)
        return Suite.from_model(row) if row else None

    @strawberry.field
    def test_case(self, info: Info[Context, None], id: strawberry.ID) -> Optional[TestCase]:
        info.context.require_user()
        row = _get(info.context.db, models.TestCase, id)
        return TestCase.from_model(row) if row else None

    @strawberry.field
    def run(self, info: Info[Context, None], id: strawberry.ID) -> Optional[Run]:
        info.context.require_user()
        row = _get(info.context.db, models.TestRun, id)
        return Run.from_model(row) if row else None


def _pk(id_: strawberry.ID) -> int:
    try:
        return int(id_)
    except (TypeError, ValueError):
        raise graphql_error(400, f"Invalid ID: {id_!r}")


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_project(self, info: Info[Context, None], input: ProjectInput) -> Project:
        admin = info.context.require_admin()
        payload = schemas.ProjectCreate(name=input.name, description=input.description)
        return Project.from_model(await _call_rest(_rest().create_project, payload, info.context.db, admin))

    @strawberry.mutation
    async def create_suite(self, info: Info[Context, None], project_id: strawberry.ID, input: SuiteInput) -> Suite:
        admin = info.context.require_admin()
        payload = schemas.TestSuiteCreate(name=input.name, description=input.description)
        return Suite.from_model(
            await _call_rest(_rest().create_suite, _pk(project_id), payload, info.context.db, admin))

    @strawberry.mutation
    async def create_test_case(self, info: Info[Context, None], suite_id: strawberry.ID, input: TestCaseInput) -> TestCase:
        admin = info.context.require_admin()
        payload = schemas.TestCaseCreate(
            title=input.title, description=input.description, steps=input.steps,
            expected_result=input.expected_result, status=input.status.value, priority=input.priority.value,
        )
        return TestCase.from_model(
            await _call_rest(_rest().create_testcase, _pk(suite_id), payload, info.context.db, admin))

    @strawberry.mutation
    async def update_test_case(self, info: Info[Context, None], id: strawberry.ID, input: TestCaseUpdateInput) -> TestCase:
        admin = info.context.require_admin()
        fields = {}
        for name in ("title", "description", "steps", "expected_result", "status", "priority"):
            value = getattr(input, name)
            if value is not strawberry.UNSET:
                fields[name] = value.value if isinstance(value, Enum) else value
        payload = schemas.TestCaseUpdate(**fields)
        return TestCase.from_model(
            await _call_rest(_rest().update_testcase, _pk(id), payload, info.context.db, admin))

    @strawberry.mutation
    async def delete_test_case(self, info: Info[Context, None], id: strawberry.ID) -> bool:
        admin = info.context.require_admin()
        await _call_rest(_rest().delete_testcase, _pk(id), info.context.db, admin)
        return True

    @strawberry.mutation
    async def create_run(self, info: Info[Context, None], suite_id: strawberry.ID, input: RunInput) -> Run:
        user = info.context.require_user()
        payload = schemas.TestRunCreate(name=input.name, environment_key=input.environment_key)
        return Run.from_model(await _call_rest(_rest().create_run, _pk(suite_id), payload, info.context.db, user))

    @strawberry.mutation(description="Also broadcasts `result_updated` to the run's WebSocket room.")
    async def update_result(
        self, info: Info[Context, None], run_id: strawberry.ID, test_case_id: strawberry.ID, input: ResultInput,
    ) -> TestResult:
        user = info.context.require_user()
        payload = schemas.TestResultUpdate(status=input.status.value, notes=input.notes)
        out = await _call_rest(_rest().update_result, _pk(run_id), _pk(test_case_id), payload, info.context.db, user)
        return TestResult.from_model(info.context.db.get(models.TestResult, out["id"]))


@strawberry.type(description="A live change to a run — the same events the /ws/runs/{id} socket carries.")
class RunEvent:
    type: str = strawberry.field(description="result_updated | results_populated")
    run_id: strawberry.ID
    test_case_id: Optional[strawberry.ID]
    status: Optional[str]
    notes: Optional[str]
    updated_by: Optional[str]
    run_completed: Optional[bool]

    @staticmethod
    def from_payload(run_id: int, payload: dict) -> "RunEvent":
        tc_id = payload.get("testcase_id")
        return RunEvent(
            type=payload.get("type", ""), run_id=strawberry.ID(str(run_id)),
            test_case_id=strawberry.ID(str(tc_id)) if tc_id is not None else None,
            status=payload.get("status"), notes=payload.get("notes"),
            updated_by=payload.get("updated_by"), run_completed=payload.get("run_completed"),
        )


@strawberry.type
class Subscription:
    @strawberry.subscription(description="Streams every change to one run until the client completes the subscription.")
    async def run_updates(self, info: Info[Context, None], run_id: strawberry.ID) -> AsyncGenerator[RunEvent, None]:
        info.context.require_user()
        pk = _pk(run_id)
        db = info.context.db
        if not db.query(models.TestRun).filter(models.TestRun.id == pk).first():
            raise graphql_error(404, "Run not found")
        # Don't pin a pooled DB connection for the subscription's lifetime.
        db.close()
        # Shares api/main.py's broadcaster with the plain WebSocket, so both
        # transports see exactly the same events.
        manager = _rest().ws_manager
        queue = manager.listen(pk)
        try:
            while True:
                yield RunEvent.from_payload(pk, await queue.get())
        finally:
            manager.unlisten(pk, queue)


# ─── Schema + router ─────────────────────────────────────────────────────────

def _should_mask(error: GraphQLError) -> bool:
    """Hide unexpected exceptions' internals; keep deliberate errors (auth,
    not-found, validation) readable."""
    return error.original_error is not None and not isinstance(error.original_error, GraphQLError)


def _is_production() -> bool:
    return os.getenv("VERCEL_ENV") == "production" or os.getenv("GRAPHQL_PRODUCTION", "").lower() == "true"


class _Schema(strawberry.Schema):
    def process_errors(self, errors, execution_context=None):
        # Log only unexpected failures; "not authenticated", "not found" and
        # validation errors are normal client outcomes, not server errors.
        unexpected = [e for e in errors if _should_mask(e)]
        if unexpected:
            super().process_errors(unexpected, execution_context)


def build_schema(production: bool) -> strawberry.Schema:
    # Factories, not instances: strawberry builds fresh extensions per request.
    extensions = [
        lambda: QueryDepthLimiter(max_depth=MAX_DEPTH),
        lambda: MaxAliasesLimiter(max_alias_count=MAX_ALIASES),
        lambda: MaxTokensLimiter(max_token_count=MAX_TOKENS),
        lambda: MaskErrors(should_mask_error=_should_mask),
    ]
    if production:
        extensions.append(DisableIntrospection)
    return _Schema(query=Query, mutation=Mutation, subscription=Subscription, extensions=extensions)


_PRODUCTION = _is_production()
schema = build_schema(_PRODUCTION)

graphql_router = GraphQLRouter(
    schema,
    context_getter=get_context,
    graphql_ide=None if _PRODUCTION else "graphiql",
    # POST only: GET queries end up in access logs and caches.
    allow_queries_via_get=False,
    # The current protocol only; the legacy `graphql-ws` (subscriptions-
    # transport-ws) is unmaintained and not offered.
    subscription_protocols=(GRAPHQL_TRANSPORT_WS_PROTOCOL,),
    include_in_schema=False,
)
