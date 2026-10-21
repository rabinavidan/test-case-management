from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
import enum


class TestCaseStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    deprecated = "deprecated"


class TestCasePriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TestResultStatus(str, enum.Enum):
    pending = "pending"
    pass_ = "pass"
    fail = "fail"
    skip = "skip"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="executor")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Environment(Base):
    """A deployment target test runs execute against — staging, regression,
    preprod, prod — each pinned to its own Kubernetes node (see k8s/
    overlays/<key>/, which sets nodeSelector to node_name's label)."""
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    tier = Column(Integer, nullable=False)  # pipeline position: 1=staging .. 4=prod
    namespace = Column(String(100), nullable=False)
    node_name = Column(String(100), nullable=False)
    region = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    runs = relationship("TestRun", back_populates="environment")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    suites = relationship("TestSuite", back_populates="project", cascade="all, delete-orphan")


class TestSuite(Base):
    __tablename__ = "test_suites"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="suites")
    test_cases = relationship("TestCase", back_populates="suite", cascade="all, delete-orphan")
    runs = relationship("TestRun", back_populates="suite", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, ForeignKey("test_suites.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    steps = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    status = Column(String(20), default="draft")
    priority = Column(String(20), default="medium")
    created_at = Column(DateTime, default=datetime.utcnow)

    suite = relationship("TestSuite", back_populates="test_cases")
    results = relationship("TestResult", back_populates="test_case", cascade="all, delete-orphan")


class TestCaseEmbedding(Base):
    """One row per test case, holding a JSON-encoded embedding of its title
    + description — see api/embeddings.py for why this is a plain JSON
    column (works identically on SQLite and Postgres) rather than a
    pgvector column, and api/retrieval.py for how it's used to ground AI
    Test Generation against existing cases in the same suite."""
    __tablename__ = "test_case_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False, unique=True, index=True)
    suite_id = Column(Integer, ForeignKey("test_suites.id"), nullable=False, index=True)
    embedding_json = Column(Text, nullable=False)
    # Which model produced embedding_json (course milestone M8, see
    # api/embeddings.py) - NULL on rows written before M8, which were all
    # the hashed vector. A row whose model differs from the current
    # provider is re-embedded on read instead of compared across models.
    embedding_model = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, ForeignKey("test_suites.id"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)

    suite = relationship("TestSuite", back_populates="runs")
    results = relationship("TestResult", back_populates="run", cascade="all, delete-orphan")
    created_by = relationship("User")
    environment = relationship("Environment", back_populates="runs")

    @property
    def created_by_username(self):
        # Read by TestRunResponse (from_attributes), like environment_key below.
        return self.created_by.username if self.created_by else None

    @property
    def environment_key(self):
        return self.environment.key if self.environment else None

    @property
    def environment_name(self):
        return self.environment.name if self.environment else None


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=False)
    testcase_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    status = Column(String(20), default="pending")
    notes = Column(Text, nullable=True)
    executed_at = Column(DateTime, nullable=True)

    run = relationship("TestRun", back_populates="results")
    test_case = relationship("TestCase", back_populates="results")


class ContactMessage(Base):
    """A "Contact Us" submission from the public landing page — stored
    regardless of whether the notification email actually sends, so a
    misconfigured/unset email backend never silently loses a message."""
    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(30), nullable=False)
    description = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class LogEntry(Base):
    """One row per HTTP request/response, unhandled server exception, or
    reported browser-side error — the "log center" admins use to see what's
    happening across the running app without shelling into Vercel's own
    function logs. Self-pruned (see _record_log) so it can't grow unbounded
    on a long-lived Postgres deployment."""
    __tablename__ = "log_entries"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    level = Column(String(10), nullable=False, index=True)    # info | warning | error
    source = Column(String(10), nullable=False, index=True)   # server | client
    message = Column(String(500), nullable=False)
    method = Column(String(10), nullable=True)
    path = Column(String(255), nullable=True)
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    extra = Column(Text, nullable=True)


class AIGeneration(Base):
    """One AI Test Generation call (course milestone M9): the inputs and the
    model that produced a batch of drafts, so a human's later verdict on any
    of those drafts can be exported as a self-contained eval case (see
    AIDraftReview and scripts/export_review_dataset.py)."""
    __tablename__ = "ai_generations"

    id = Column(String(36), primary_key=True)  # uuid4 hex string
    suite_id = Column(Integer, nullable=False, index=True)
    suite_name = Column(String(255), nullable=False)
    feature_description = Column(Text, nullable=False)
    requested_count = Column(Integer, nullable=False)
    grounded = Column(Boolean, nullable=False, default=False)
    model = Column(String(100), nullable=False)
    prompt_version = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AIDraftReview(Base):
    """A human verdict on one AI-generated draft test case (M9).

    suite_id/test_case_id are deliberately plain columns, not foreign keys:
    a rejected draft's test case is deleted, and a suite can be deleted
    later, but the human judgement is the valuable part and must outlive
    both — it is what feeds evals/datasets/test_generation_reviewed.json.
    original_json is the draft exactly as the model produced it, so an edit
    can always be shown as before/after."""
    __tablename__ = "ai_draft_reviews"

    id = Column(Integer, primary_key=True, index=True)
    generation_id = Column(String(36), ForeignKey("ai_generations.id"), nullable=True, index=True)
    suite_id = Column(Integer, nullable=False, index=True)
    test_case_id = Column(Integer, nullable=True, index=True)
    original_json = Column(Text, nullable=False)
    verdict = Column(String(20), nullable=False, default="pending", index=True)  # pending|accepted|edited|rejected
    reason = Column(Text, nullable=True)
    edited_json = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    generation = relationship("AIGeneration")
    reviewed_by = relationship("User")
