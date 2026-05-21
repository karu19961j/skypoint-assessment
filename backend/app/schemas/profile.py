from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import LocationType


# ---------- experience + education ----------


class ExperienceUpsert(BaseModel):
    """One prior-experience row submitted alongside the profile.

    `is_current=True` means "still working here" — the form's `to_date`
    widget is disabled in that case and we persist `to_date=None`.
    """

    company: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    from_date: date
    to_date: date | None = None
    is_current: bool = False
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _validate_dates(self) -> "ExperienceUpsert":
        # Strip stray to_date if is_current claims the role is ongoing —
        # surfacing both is contradictory and would confuse a reader of the
        # JSON snapshot.
        if self.is_current:
            self.to_date = None
        elif self.to_date is not None and self.to_date < self.from_date:
            raise ValueError("to_date must be on or after from_date")
        return self


class ExperienceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: str
    role: str
    from_date: date
    to_date: date | None
    is_current: bool
    description: str | None


class EducationUpsert(BaseModel):
    institution: str = Field(min_length=1, max_length=200)
    degree: str = Field(min_length=1, max_length=200)
    field_of_study: str | None = Field(default=None, max_length=200)
    from_year: int = Field(ge=1950, le=2100)
    to_year: int | None = Field(default=None, ge=1950, le=2100)

    @model_validator(mode="after")
    def _validate_years(self) -> "EducationUpsert":
        if self.to_year is not None and self.to_year < self.from_year:
            raise ValueError("to_year must be on or after from_year")
        return self


class EducationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    institution: str
    degree: str
    field_of_study: str | None
    from_year: int
    to_year: int | None


# ---------- profile ----------


class ProfileResumeOut(BaseModel):
    """Resume metadata exposed on profile responses. Includes the storage
    key so the candidate's form can re-submit it on save without having
    to re-upload. The key is scoped to the candidate (prefix-encoded)
    and the candidate is always allowed to see their own."""

    key: str | None = None
    filename: str | None = None
    size_bytes: int | None = None
    content_type: str | None = None


class ProfileUpsert(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=30)
    is_fresher: bool = False
    years_experience: int = Field(default=0, ge=0, le=60)
    current_ctc: int = Field(default=0, ge=0)
    expected_ctc: int = Field(ge=0)
    notice_period_days: int = Field(default=0, ge=0, le=365)
    preferred_locations: list[LocationType] = Field(default_factory=list)
    experiences: list[ExperienceUpsert] = Field(default_factory=list, max_length=20)
    educations: list[EducationUpsert] = Field(default_factory=list, max_length=10)
    # Resume key set by a prior call to POST /api/resume/upload. Null
    # clears the resume from the profile (candidate can re-upload).
    resume_key: str | None = Field(default=None, max_length=255)

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
    def _normalize_and_apply_fresher_flag(self) -> "ProfileUpsert":
        self.skills = [s.strip() for s in self.skills if s and s.strip()]
        # The fresher checkbox zeroes out the work-experience inputs so
        # one source of truth is the flag — no contradictory state where
        # is_fresher=True but years_experience=5.
        if self.is_fresher:
            self.years_experience = 0
            self.current_ctc = 0
            self.experiences = []
        return self


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skills: list[str]
    is_fresher: bool
    years_experience: int
    current_ctc: int
    expected_ctc: int
    notice_period_days: int
    preferred_locations: list[LocationType]
    experiences: list[ExperienceOut]
    educations: list[EducationOut]
    resume: ProfileResumeOut | None = None
    created_at: datetime

    @field_validator("preferred_locations", mode="before")
    @classmethod
    def _coerce_locations(cls, value: object) -> list[str]:
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
        for loc in value:
            if not isinstance(loc, LocationType):
                raise ValueError(f"unknown location: {loc!r}")
        return value
