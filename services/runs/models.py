from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class TestRun(Base):
    __tablename__ = "runs_test_runs"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, nullable=True)

    results = relationship("TestResult", back_populates="run", cascade="all, delete-orphan")


class TestResult(Base):
    __tablename__ = "runs_test_results"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("runs_test_runs.id"), nullable=False)
    testcase_id = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")
    notes = Column(Text, nullable=True)
    executed_at = Column(DateTime, nullable=True)

    run = relationship("TestRun", back_populates="results")


class Alert(Base):
    """One row per alert.triggered Kafka message ingested by
    services/worker/kafka_consumer.py. (run_id, testcase_id) is
    deduplicated on write - see kafka_consumer.persist_alert - since a
    consumer's at-least-once redelivery of the same message must not
    create duplicate alerts."""
    __tablename__ = "runs_alerts"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, nullable=False, index=True)
    suite_id = Column(Integer, nullable=False)
    testcase_id = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
