from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Project(Base):
    __tablename__ = "projects_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    suites = relationship("TestSuite", back_populates="project", cascade="all, delete-orphan")


class TestSuite(Base):
    __tablename__ = "projects_test_suites"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects_projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="suites")
    test_cases = relationship("TestCase", back_populates="suite", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "projects_test_cases"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, ForeignKey("projects_test_suites.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    steps = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    status = Column(String(20), default="draft")
    priority = Column(String(20), default="medium")
    created_at = Column(DateTime, default=datetime.utcnow)

    suite = relationship("TestSuite", back_populates="test_cases")


class AIDraftReview(Base):
    """A reviewer's verdict on one AI-generated test case draft (course
    milestone M9), with the prompt and model output it judged. A review log,
    not part of the suite: suite_id/test_case_id are plain ids (with a
    suite_name snapshot) so a review survives its project being deleted -
    evals/export_reviews.py turns rejections into eval cases. (SQLite can
    reuse a deleted suite's id, so suite_id alone doesn't identify a suite
    across deletions there; Postgres never reuses one.)"""
    __tablename__ = "projects_ai_draft_reviews"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, nullable=True, index=True)
    suite_name = Column(String(255), nullable=True)
    test_case_id = Column(Integer, nullable=True)  # the saved case, for accepted/edited
    feature_description = Column(Text, nullable=False)
    model = Column(String(100), nullable=True)
    batch_size = Column(Integer, nullable=False, default=1)  # drafts generated together
    verdict = Column(String(20), nullable=False)  # accepted | edited | rejected
    reason = Column(Text, nullable=True)
    must_cover = Column(Text, nullable=False, default="[]")  # JSON list of keywords
    output = Column(Text, nullable=False)  # JSON: the draft as generated
    edited = Column(Text, nullable=True)  # JSON: the reviewer's version
    reviewer = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
