from sqlalchemy.orm import DeclarativeBase, sessionmaker

from services.common.db import build_db

engine, get_db = build_db("./auth.db")

# main.py's _seed_admin() needs a session outside a request's lifecycle (it
# runs once at import time, before the app object even exists), so it can't
# use the get_db() FastAPI dependency above — build_db() deliberately doesn't
# expose the sessionmaker it builds internally (see its own docstring), so
# this is a second one bound to the same engine, used only for that.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
