from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Claims that must be present on every decoded token. python-jose enforces
# these via the `require` option; a token missing any of them is rejected
# *before* we get to the manual checks in `deps.get_current_user`.
_REQUIRED_CLAIMS = ["exp", "sub", "role"]


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(subject: int, role: str) -> str:
    """Issue a 30-minute access token for `subject` (the user id)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": str(subject), "role": role, "exp": expire}
    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": _REQUIRED_CLAIMS},
        )
    except JWTError as exc:
        raise ValueError("invalid token") from exc
