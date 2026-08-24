from sqlalchemy.orm import DeclarativeBase

from services.common.db import build_db

engine, get_db = build_db("./auth.db")


class Base(DeclarativeBase):
    pass
