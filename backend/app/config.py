import logging
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Default JWT secret value used in .env.example. If the running process still
# carries this value (or any other obviously-fake one), we refuse to boot in
# non-test environments so a placeholder secret can never reach production.
PLACEHOLDER_JWT_SECRETS: frozenset[str] = frozenset(
    {
        "change-me-to-a-long-random-string-for-prod",
        "change-me",
        "secret",
        "",
    }
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+psycopg://jobportal:jobportal_dev_password@postgres:5432/jobportal"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 30

    cors_origins: str = "http://localhost:5173"

    seed_hr_email: str = "hr@test.com"
    seed_hr_password: str = "Hr@1234"
    seed_candidate_email: str = "candidate@test.com"
    seed_candidate_password: str = "Candidate@1234"

    # Self-serve HR registration is OFF by default. The seeded HR account is
    # sufficient for assessment review; in production, HR users should be
    # provisioned via an invite/admin flow rather than via the public form.
    allow_hr_self_register: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def assert_production_ready(self) -> None:
        """Refuse to boot when obviously-fake secrets reach a real process."""
        if self.jwt_secret in PLACEHOLDER_JWT_SECRETS:
            raise RuntimeError(
                "JWT_SECRET is a placeholder. Set a real, random secret in .env "
                "(e.g. `openssl rand -hex 32`) before starting the app."
            )
        if len(self.jwt_secret) < 32:
            logger.warning(
                "JWT_SECRET is shorter than 32 characters (%d); use a 32+ "
                "character random string in production.",
                len(self.jwt_secret),
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
