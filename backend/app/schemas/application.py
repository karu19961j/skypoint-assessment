from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models import ApplicationStage


class ApplicationCreate(BaseModel):
    job_id: int
    resume_link: HttpUrl
    cover_note: str = Field(default="", max_length=5000)
    current_ctc: int = Field(ge=0)
    expected_ctc: int = Field(ge=0)
    notice_period_days: int = Field(ge=0, le=365)
    years_experience: int = Field(ge=0, le=60)
    skills: list[str] = Field(default_factory=list, max_length=30)


class ApplicationStageUpdate(BaseModel):
    stage: ApplicationStage


class JobMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    department: str


class CandidateMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    candidate_id: int
    resume_link: str
    cover_note: str
    current_ctc: int
    expected_ctc: int
    notice_period_days: int
    years_experience: int
    skills: list[str]
    stage: ApplicationStage
    created_at: datetime
    updated_at: datetime


class ApplicationDetail(ApplicationOut):
    job: JobMini | None = None
    candidate: CandidateMini | None = None


class ApplicationNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class ApplicationNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    hr_id: int
    body: str
    created_at: datetime


class ApplicationEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    from_stage: ApplicationStage | None
    to_stage: ApplicationStage
    changed_by_user_id: int
    created_at: datetime


from app.schemas.score import BaseScoreOut


class ScoreBreakdownOut(BaseScoreOut):
    """Score for HR's candidate ranking. The notice-period bonus is
    populated; the location bonus is always 0 (it's a recommendations
    concept, not a ranking one)."""


class RankedApplicationOut(ApplicationDetail):
    score: ScoreBreakdownOut
