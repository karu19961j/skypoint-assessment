from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import EmploymentType, JobStatus, LocationType


class JobBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    department: str = Field(min_length=1, max_length=100)
    location_type: LocationType
    employment_type: EmploymentType
    exp_min: int = Field(ge=0, le=60)
    exp_max: int = Field(ge=0, le=60)
    ctc_min: int = Field(ge=0)
    ctc_max: int = Field(ge=0)
    skills: list[str] = Field(default_factory=list, max_length=30)
    deadline: date | None = None

    @model_validator(mode="after")
    def _check_ranges(self) -> "JobBase":
        if self.exp_max < self.exp_min:
            raise ValueError("exp_max must be >= exp_min")
        if self.ctc_max < self.ctc_min:
            raise ValueError("ctc_max must be >= ctc_min")
        self.skills = [s.strip() for s in self.skills if s and s.strip()]
        return self


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    department: str | None = Field(default=None, min_length=1, max_length=100)
    location_type: LocationType | None = None
    employment_type: EmploymentType | None = None
    exp_min: int | None = Field(default=None, ge=0, le=60)
    exp_max: int | None = Field(default=None, ge=0, le=60)
    ctc_min: int | None = Field(default=None, ge=0)
    ctc_max: int | None = Field(default=None, ge=0)
    skills: list[str] | None = None
    deadline: date | None = None
    status: JobStatus | None = None


class JobStatusUpdate(BaseModel):
    status: JobStatus


class JobOut(JobBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hr_id: int
    status: JobStatus
    created_at: datetime
