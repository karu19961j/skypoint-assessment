from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import ApplicationStage


class ApplicationCreate(BaseModel):
    job_id: int
    # resume_key is returned by POST /api/resume/upload — the apply form
    # uploads the file first and then submits the key with the rest of
    # the structured fields. Nullable so a candidate can apply without a
    # resume if they choose (cover note + profile may be enough).
    resume_key: str | None = Field(default=None, max_length=255)
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


class ResumeMeta(BaseModel):
    """Resume metadata embedded on application responses. Identity-bearing
    (the filename can leak a candidate's name), so list endpoints zero
    this out and only the detail endpoint returns it populated."""

    filename: str | None = None
    size_bytes: int | None = None
    content_type: str | None = None


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    candidate_id: int
    resume: ResumeMeta | None = None
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
    # Frontend reads this off the application to filter the stage <select>
    # so HR can't pick an illegal transition. Empty list = terminal stage.
    allowed_next_stages: list[ApplicationStage] = []


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


# ---------- resume upload payloads ----------


class AutofillOut(BaseModel):
    """What the apply form pre-fills after a successful upload. Empty
    fields = "we couldn't tell" — the form leaves the user's current
    value alone in those cases."""

    skills: list[str] = []
    years_experience: int | None = None


class ResumeUploadOut(BaseModel):
    """Response of POST /api/resume/upload. The candidate's next step is
    to POST /api/applications/ with `resume_key` plus their form fields."""

    resume_key: str
    filename: str
    size_bytes: int
    content_type: str
    autofill: AutofillOut
