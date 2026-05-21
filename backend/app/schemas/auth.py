from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole
from app.schemas.user import UserOut


def _lowercase_email(value: str) -> str:
    """Normalise emails to lowercase on the way in so the router code can
    just compare without `.lower()` everywhere — and so two signups for
    `Foo@x.com` vs `foo@x.com` collide on the unique constraint as a
    user would expect."""
    return value.strip().lower()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole

    _email_lower = field_validator("email", mode="after")(_lowercase_email)


class LoginIn(BaseModel):
    email: EmailStr
    password: str

    _email_lower = field_validator("email", mode="after")(_lowercase_email)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
