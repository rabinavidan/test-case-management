from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = {"schema": "projects"}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    suites = relationship("TestSuite", back_populates="project", cascade="all, delete-orphan")


class TestSuite(Base):
    __tablename__ = "test_suites"
    __table_args__ = {"schema": "projects"}

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="suites")
    test_cases = relationship("TestCase", back_populates="suite", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"
    __table_args__ = {"schema": "projects"}

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, ForeignKey("projects.test_suites.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    steps = Column(Text, nullable=True)
    expected_result = Column(Text, nullable=True)
    status = Column(String(20), default="draft")
    priority = Column(String(20), default="medium")
    created_at = Column(DateTime, default=datetime.utcnow)

    suite = relationship("TestSuite", back_populates="test_cases")
