"""Shared engine + FastAPI dependency-generator factory. Every services/*/
database.py wired the same three things by hand: a `DATABASE_URL`-driven
engine, a `SessionLocal` sessionmaker, and a `get_db()` generator with
identical open/close semantics. `Base` stays local to each service (each
one's models attach to their own metadata, so `Base.metadata.create_all()`
only ever creates that service's tables) — everything else is here once.
"""
import os
from typing import Callable, Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def build_db(default_sqlite_path: str) -> tuple[Engine, Callable[[], Generator[Session, None, None]]]:
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{default_sqlite_path}")
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    return engine, get_db
