from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="executor")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
