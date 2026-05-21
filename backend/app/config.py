"""Application settings.

This is the **local-dev tier** of a three-tier config story:

  1. **local**  — env vars from a developer's `.env` (gitignored;
                  `.env.example` ships safe defaults).
  2. **CI**     — env vars injected by the workflow runner from secret
                  storage (GitHub Actions secrets, etc.).
  3. **prod**   — env vars injected by the platform from a real secrets
                  manager (Vault, AWS Secrets Manager, GCP Secret
                  Manager, etc.).

The app itself is **source-agnostic**: pydantic-settings reads from the
process environment regardless of who put the values there. Swap tier 1
for tier 3 by changing the deployment manifest, never the code.

Design choices worth knowing about:

  - `extra="forbid"` rejects unknown env vars. Catches typos like
    `JWT_EXPIRY_MINUTES` (which would otherwise silently default).
  - Secrets are typed as `SecretStr` so they never appear in repr,
    tracebacks, or `print(settings)` output by accident.
  - Numeric/categorical fields are bounded via Pydantic Fields so an
    operator can't push the JWT TTL to 100 years or set
    `APP_ENV=produciton`.
"""

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Default JWT_SECRET values that are obviously not safe for any non-local
# use. `assert_production_ready()` (called from bootstrap) refuses to
# boot if any of these reach a running process.
PLACEHOLDER_JWT_SECRETS: frozenset[str] = frozenset(
    {
        "change-me-to-a-long-random-string-for-prod",
        "change-me",
        "secret",
        "placeholder",
        "todo",
        "dev",
        "test",
        "",
    }
)

# Minimum acceptable JWT_SECRET length when the process is started in
# production mode. 32 ASCII chars ≈ 256 bits of entropy if generated
# from a CSPRNG (`openssl rand -hex 32`).
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=None,
        # Reject env vars we don't recognise — catches typos that would
        # otherwise silently fall back to the default.
        extra="forbid",
    )

    # ---------- environment ----------
    app_env: Literal["development", "test", "production"] = "development"

    # ---------- secrets ----------
    # DB URL embeds a password; wrap as SecretStr so it doesn't leak via
    # logs / Sentry / repr().
    database_url: SecretStr = SecretStr(
        "postgresql+psycopg://jobportal:jobportal_dev_password@postgres:5432/jobportal"
    )
    jwt_secret: SecretStr = SecretStr("change-me")
    seed_hr_password: SecretStr = SecretStr("Hr@1234")
    seed_candidate_password: SecretStr = SecretStr("Candidate@1234")

    # ---------- bounded scalars ----------
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_expires_minutes: int = Field(default=30, ge=1, le=24 * 60)

    cors_origins: str = "http://localhost:5173"

    # ---------- seed identities (non-secret half) ----------
    seed_hr_email: str = "hr@test.com"
    seed_candidate_email: str = "candidate@test.com"

    # ---------- feature flags ----------
    allow_hr_self_register: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def assert_production_ready(self) -> None:
        """Refuse to boot when secrets look like placeholders.

        Called from `bootstrap.main()`. Tests bypass bootstrap, so this
        guard never fires in the suite. The check ladders up by
        `app_env`: a `production` deployment additionally enforces the
        minimum-length rule.
        """
        secret = self.jwt_secret.get_secret_value()
        if secret in PLACEHOLDER_JWT_SECRETS:
            raise RuntimeError(
                "JWT_SECRET is a placeholder. Set a real, random secret "
                "in .env (e.g. `openssl rand -hex 32`) before starting "
                "the app."
            )
        if self.app_env == "production" and len(secret) < MIN_JWT_SECRET_LENGTH:
            raise RuntimeError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} "
                f"characters when APP_ENV=production (got {len(secret)})."
            )
        if len(secret) < MIN_JWT_SECRET_LENGTH:
            logger.warning(
                "JWT_SECRET is shorter than %d characters (%d); use a "
                "%d+ character random string in production.",
                MIN_JWT_SECRET_LENGTH,
                len(secret),
                MIN_JWT_SECRET_LENGTH,
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
