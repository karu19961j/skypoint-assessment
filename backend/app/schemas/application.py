from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import ApplicationStage


class ApplicationCreate(BaseModel):
    """Apply payload. All candidate-side data (CTC, experience, skills,
    education, resume) lives on the profile and gets snapshotted into
    the application row at submit time. The only per-application input
    is an optional cover note explaining *this* application."""

    job_id: int
    cover_note: str = Field(default="", max_length=5000)


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


class ExperienceSnapshot(BaseModel):
    """Snapshot of one prior-experience row at apply time. Dates are
    JSON-serialized as ISO strings because the snapshot lives in JSONB.
    """

    company: str
    role: str
    from_date: str
    to_date: str | None
    is_current: bool
    description: str | None = None


class EducationSnapshot(BaseModel):
    institution: str
    degree: str
    field_of_study: str | None = None
    from_year: int
    to_year: int | None


class ProfileSnapshotOut(BaseModel):
    """Non-filterable profile data captured at apply time. The HR drawer
    reads this to render the candidate's history. Filterable fields
    (skills, ctc, exp, notice) stay as proper columns on the row so
    applicant search still uses indexes."""

    is_fresher: bool = False
    experiences: list[ExperienceSnapshot] = []
    educations: list[EducationSnapshot] = []


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
    profile_snapshot: ProfileSnapshotOut | None = None
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


class ResumeUploadOut(BaseModel):
    """Response of POST /api/resume/upload. The candidate's next step is
    to submit this key via PUT /api/profile so the resume is attached
    to their profile and gets snapshotted into every future application."""

    resume_key: str
    filename: str
    size_bytes: int
    content_type: str
