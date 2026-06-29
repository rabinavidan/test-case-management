from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class TestRun(Base):
    __tablename__ = "test_runs"
    __table_args__ = {"schema": "runs"}

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, nullable=True)

    results = relationship("TestResult", back_populates="run", cascade="all, delete-orphan")


class TestResult(Base):
    __tablename__ = "test_results"
    __table_args__ = {"schema": "runs"}

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("runs.test_runs.id"), nullable=False)
    testcase_id = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")
    notes = Column(Text, nullable=True)
    executed_at = Column(DateTime, nullable=True)

    run = relationship("TestRun", back_populates="results")
