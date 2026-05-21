from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
