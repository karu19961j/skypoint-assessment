from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, UserRole
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not token:
        raise _unauthorized("Not authenticated")

    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise _unauthorized("Could not validate credentials") from exc

    sub = payload.get("sub")
    if sub is None:
        raise _unauthorized("Could not validate credentials")
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise _unauthorized("Could not validate credentials") from exc
    role_claim = payload.get("role")

    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized("User no longer exists")

    # The role claim must still match the DB. Today the role never changes,
    # so this is mostly defence-in-depth — but it forecloses a privilege-
    # escalation window if we ever add role demotion (a token issued while
    # the user was HR would otherwise still grant HR access until expiry).
    if role_claim != user.role.value:
        raise _unauthorized("Token does not match current account role.")

    return user


def require_role(*roles: UserRole):
    allowed = set(roles)
    role_names = ",".join(r.value for r in roles)

    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return user

    # FastAPI's auto-generated OpenAPI uses the dep's __name__; give it
    # something informative so /api/docs shows which roles each route requires.
    _dep.__name__ = f"require_role({role_names})"
    return _dep


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]
