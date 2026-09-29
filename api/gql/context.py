"""Per-request GraphQL context: DB session, the authenticated user (or
None), and a fresh set of DataLoaders — loaders cache per request only, so
one request can never see another's (possibly stale) rows."""
from typing import Optional

from fastapi import Depends, HTTPException, Request
from graphql import GraphQLError
from sqlalchemy.orm import Session
from strawberry.fastapi import BaseContext

from .. import models
from ..auth import _decode_token
from ..database import get_db
from .loaders import Loaders

# `extensions.code` values, mirroring the HTTP status the REST API returns
# for the same failure — clients (and tests) branch on the code, not the
# human-readable message.
HTTP_STATUS_TO_CODE = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "BAD_REQUEST",
}


def graphql_error(status_code: int, message: str) -> GraphQLError:
    return GraphQLError(message, extensions={"code": HTTP_STATUS_TO_CODE.get(status_code, "INTERNAL_SERVER_ERROR")})


class Context(BaseContext):
    def __init__(self, db: Session, user: Optional[models.User]):
        super().__init__()
        self.db = db
        self._user = user
        self.loaders = Loaders(db)

    def require_user(self) -> models.User:
        if self._user is None:
            raise graphql_error(401, "Not authenticated")
        return self._user

    def require_admin(self) -> models.User:
        user = self.require_user()
        if user.role != "admin":
            raise graphql_error(403, "Admin access required")
        return user


def _user_from_request(request: Request, db: Session) -> Optional[models.User]:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        data = _decode_token(token)
    except HTTPException:
        return None
    return db.query(models.User).filter(models.User.id == int(data["sub"])).first()


async def get_context(request: Request, db: Session = Depends(get_db)) -> Context:
    return Context(db, _user_from_request(request, db))
