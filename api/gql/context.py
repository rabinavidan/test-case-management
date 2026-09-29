"""Per-request GraphQL context: DB session, the authenticated user (or
None), and a fresh set of DataLoaders — loaders cache per request only, so
one request can never see another's (possibly stale) rows."""
from typing import Optional

from fastapi import Depends, HTTPException
from graphql import GraphQLError
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection
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
        if self._user is None and isinstance(self.connection_params, dict):
            # Subscriptions: browsers can't set headers on a WebSocket
            # handshake, so graphql-transport-ws clients send the token in
            # the connection_init payload — as `authToken` or `Authorization`.
            params = self.connection_params
            token = params.get("authToken") or _bearer_token(str(params.get("Authorization", "")))
            self._user = _user_from_token(self.db, token)
        if self._user is None:
            raise graphql_error(401, "Not authenticated")
        return self._user

    def require_admin(self) -> models.User:
        user = self.require_user()
        if user.role != "admin":
            raise graphql_error(403, "Admin access required")
        return user


def _bearer_token(header: str) -> Optional[str]:
    scheme, _, token = header.partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def _user_from_token(db: Session, token: Optional[str]) -> Optional[models.User]:
    if not token or not isinstance(token, str):
        return None
    try:
        data = _decode_token(token)
    except HTTPException:
        return None
    return db.query(models.User).filter(models.User.id == int(data["sub"])).first()


async def get_context(connection: HTTPConnection, db: Session = Depends(get_db)) -> Context:
    # HTTPConnection, not Request: the same getter serves the WebSocket
    # route (subscriptions), where FastAPI can't inject a Request.
    token = _bearer_token(connection.headers.get("authorization", ""))
    return Context(db, _user_from_token(db, token))
