from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import LocationType


class ProfileUpsert(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=30)
    years_experience: int = Field(ge=0, le=60)
    expected_ctc: int = Field(ge=0)
    # Multi-select: candidate can list any combination of Remote / Hybrid /
    # On-site. Empty list = no location preference, no location bonus.
    preferred_locations: list[LocationType] = Field(default_factory=list)

    @field_validator("preferred_locations")
    @classmethod
    def _dedupe_locations(cls, value: list[LocationType]) -> list[LocationType]:
        seen: set[LocationType] = set()
        deduped: list[LocationType] = []
        for loc in value:
            if loc not in seen:
                seen.add(loc)
                deduped.append(loc)
        return deduped

    @model_validator(mode="after")
    def _normalize_skills(self) -> "ProfileUpsert":
        self.skills = [s.strip() for s in self.skills if s and s.strip()]
        return self


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skills: list[str]
    years_experience: int
    expected_ctc: int
    preferred_locations: list[LocationType]
    created_at: datetime

    @field_validator("preferred_locations", mode="before")
    @classmethod
    def _coerce_locations(cls, value: object) -> list[str]:
        # Stored as text[]; cast each entry into the LocationType enum so
        # Pydantic validates them and the serialiser emits the lowercase value.
        if value is None:
            return []
        return list(value)  # type: ignore[arg-type]
