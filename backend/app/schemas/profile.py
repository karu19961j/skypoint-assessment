from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import LocationType


class ProfileUpsert(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=30)
    years_experience: int = Field(ge=0, le=60)
    expected_ctc: int = Field(ge=0)
    preferred_location: LocationType | None = None

    @model_validator(mode="after")
    def _normalize_skills(self) -> "ProfileUpsert":
        self.skills = [s.strip() for s in self.skills if s and s.strip()]
        return self


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skills: list[str]
    years_experience: int
    expected_ctc: int
    preferred_location: LocationType | None
    created_at: datetime
