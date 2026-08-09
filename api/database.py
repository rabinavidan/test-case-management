from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import os

# Vercel's filesystem is read-only except for /tmp
_default_db = "sqlite:////tmp/testcases.db" if os.getenv("VERCEL") else "sqlite:///./testcases.db"
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or _default_db

# Supabase/Neon/Heroku expose postgres:// but SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
else:
    # Each Vercel invocation is a separate process, so a local connection
    # pool just adds a second (redundant) layer on top of Neon's own
    # pooler and multiplies simultaneous connection attempts under
    # concurrent cold starts, tripping Neon's "too many database
    # connection attempts" limit. NullPool opens one connection per
    # request and closes it immediately after, which is what Neon's
    # serverless/pooled endpoint expects.
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
