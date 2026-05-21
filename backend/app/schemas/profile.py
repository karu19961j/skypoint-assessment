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
        """Stored as text[] in Postgres. Cast None → [] and pass each entry
        through to the LocationType enum validator (the field type does
        the actual validation; this just normalises the container)."""
        if value is None:
            return []
        if not isinstance(value, (list, tuple)):
            raise TypeError(
                f"preferred_locations must be a list, got {type(value).__name__}"
            )
        return list(value)

    @field_validator("preferred_locations", mode="after")
    @classmethod
    def _check_known_locations(cls, value: list[LocationType]) -> list[LocationType]:
        """A raw-SQL insert that bypassed Pydantic could persist garbage like
        'loud' into the text[] column. Re-validate on read so the API never
        emits unknown values to clients."""
        for loc in value:
            if not isinstance(loc, LocationType):
                raise ValueError(f"unknown location: {loc!r}")
        return value
