"""Helpers shared by the lifecycle, discovery, and export sub-routers.

Split out so:
  - The three sub-modules each fit in one screen,
  - The filter/sort/detail surface lives in exactly one place,
  - Adding a new endpoint that touches applications doesn't tempt anyone
    to re-implement the anonymization rule.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, Query as _Query, status
from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationEvent,
    ApplicationStage,
    Job,
    User,
    UserRole,
)
from app.schemas.application import (
    ApplicationDetail,
    ApplicationOut,
    CandidateMini,
    JobMini,
)
from app.sorts import ApplicantSort


# ---------- stage transition map ----------
#
# The pipeline is mostly forward but HR sometimes needs to step a candidate
# back one stage for a re-evaluation. Anything → rejected is always legal.
# Hired / rejected are terminal — no transitions out. The frontend reads
# `allowed_next_stages` off ApplicationDetail to filter the dropdown so an
# HR literally can't see an illegal option.
STAGE_TRANSITIONS: dict[ApplicationStage, frozenset[ApplicationStage]] = {
    ApplicationStage.applied: frozenset(
        {ApplicationStage.screening, ApplicationStage.rejected}
    ),
    ApplicationStage.screening: frozenset(
        {
            ApplicationStage.applied,
            ApplicationStage.interview,
            ApplicationStage.rejected,
        }
    ),
    ApplicationStage.interview: frozenset(
        {
            ApplicationStage.screening,
            ApplicationStage.offer,
            ApplicationStage.rejected,
        }
    ),
    ApplicationStage.offer: frozenset(
        {
            ApplicationStage.interview,
            ApplicationStage.hired,
            ApplicationStage.rejected,
        }
    ),
    ApplicationStage.hired: frozenset(),
    ApplicationStage.rejected: frozenset(),
}


def allowed_next_stages(current: ApplicationStage) -> list[ApplicationStage]:
    """Return the stages `current` is allowed to transition into (sorted)."""
    return sorted(STAGE_TRANSITIONS[current], key=lambda s: s.value)


def is_allowed_transition(
    current: ApplicationStage, target: ApplicationStage
) -> bool:
    """No-op transitions (current == target) are allowed but produce no event."""
    if target == current:
        return True
    return target in STAGE_TRANSITIONS[current]


# ---------- detail builder ----------


def detail(application: Application, *, include_identity: bool = False) -> ApplicationDetail:
    """Build an ApplicationDetail payload.

    `include_identity=False` (the default for list endpoints) anonymizes
    the response: candidate.full_name / candidate.email / resume_link are
    stripped so the HR discovery view stays bias-free even when inspected
    via the network tab. Use `include_identity=True` only when the caller
    is explicitly asking for the full profile (e.g. `GET /applications/:id`
    powering the Profile drawer).
    """
    base = ApplicationOut.model_validate(application).model_dump()
    if not include_identity:
        # Strip the resume URL from the list payload too — it can encode
        # candidate identity (e.g. naukri.com/alice-singh-cv).
        base["resume_link"] = ""
    return ApplicationDetail(
        **base,
        job=JobMini.model_validate(application.job) if application.job else None,
        candidate=(
            CandidateMini.model_validate(application.candidate)
            if include_identity and application.candidate
            else None
        ),
        allowed_next_stages=allowed_next_stages(application.stage),
    )


def get_application_or_404(db: Session, app_id: int) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )
    return app


# ---------- ownership guards ----------
#
# The same "is this HR allowed to touch this application?" check showed up
# six times in lifecycle.py, three times in discovery.py, and once in
# export.py. Extracted into helpers so every endpoint touches one row of
# logic and the 403 message stays consistent.


def _hr_owns_application(application: Application, user: User) -> bool:
    return application.job is not None and application.job.hr_id == user.id


def ensure_hr_owns_application(application: Application, user: User) -> None:
    """Raise 403 if `user` (HR) doesn't own the application's job."""
    if not _hr_owns_application(application, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this application.",
        )


def ensure_candidate_owns_application(application: Application, user: User) -> None:
    """Raise 403 if `user` (candidate) isn't the application's owner."""
    if application.candidate_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your application."
        )


def ensure_can_view_application(application: Application, user: User) -> None:
    """Per-role ownership check.

    Candidate must own the application; HR must own the application's job.
    Used by endpoints that both roles can hit (detail + timeline).
    """
    if user.role == UserRole.candidate:
        ensure_candidate_owns_application(application, user)
    else:
        ensure_hr_owns_application(application, user)


def get_hr_owned_job_or_403(db: Session, job_id: int, user: User) -> Job:
    """Resolve a job by id, 404 if missing, 403 if not owned by `user`.

    Combines the two checks that every HR-only `/by-job/{id}*` endpoint
    runs, so the route handler stays focused on the actual work.
    """
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.hr_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this job.")
    return job


# ---------- filter struct ----------


@dataclass
class ApplicantFilters:
    """Internal filter struct used by `/by-job/:id`, `/all`, and the CSV
    export. Lifted from individual Query() parameters so the three list
    endpoints share one validation/projection path."""

    stage: ApplicationStage | None = None
    skills_any: list[str] | None = None
    skills_all: list[str] | None = None
    exp_min: int | None = None
    exp_max: int | None = None
    current_ctc_min: int | None = None
    current_ctc_max: int | None = None
    expected_ctc_min: int | None = None
    expected_ctc_max: int | None = None
    notice_max_days: int | None = None
    applied_after: date | None = None
    applied_before: date | None = None
    q: str | None = None
    sort: ApplicantSort = ApplicantSort.recent


def apply_filters(
    stmt: Select[tuple[Application]], f: ApplicantFilters
) -> Select[tuple[Application]]:
    if f.stage is not None:
        stmt = stmt.where(Application.stage == f.stage)
    if f.skills_any:
        normalized = [s.strip() for s in f.skills_any if s and s.strip()]
        if normalized:
            stmt = stmt.where(Application.skills.op("&&")(normalized))
    if f.skills_all:
        normalized = [s.strip() for s in f.skills_all if s and s.strip()]
        if normalized:
            stmt = stmt.where(Application.skills.op("@>")(normalized))
    if f.exp_min is not None:
        stmt = stmt.where(Application.years_experience >= f.exp_min)
    if f.exp_max is not None:
        stmt = stmt.where(Application.years_experience <= f.exp_max)
    if f.current_ctc_min is not None:
        stmt = stmt.where(Application.current_ctc >= f.current_ctc_min)
    if f.current_ctc_max is not None:
        stmt = stmt.where(Application.current_ctc <= f.current_ctc_max)
    if f.expected_ctc_min is not None:
        stmt = stmt.where(Application.expected_ctc >= f.expected_ctc_min)
    if f.expected_ctc_max is not None:
        stmt = stmt.where(Application.expected_ctc <= f.expected_ctc_max)
    if f.notice_max_days is not None:
        stmt = stmt.where(Application.notice_period_days <= f.notice_max_days)
    if f.applied_after is not None:
        stmt = stmt.where(
            Application.created_at
            >= datetime.combine(f.applied_after, time.min, tzinfo=timezone.utc)
        )
    if f.applied_before is not None:
        stmt = stmt.where(
            Application.created_at
            < datetime.combine(
                f.applied_before + timedelta(days=1), time.min, tzinfo=timezone.utc
            )
        )
    if f.q:
        like = f"%{f.q.lower()}%"
        # Tokenize the keyword on whitespace so `q="react developer"` matches
        # candidates who have either "react" OR "developer" in their skill
        # array — the previous behaviour treated the whole string as one
        # skill, which never matched.
        skill_tokens = [tok for tok in f.q.strip().split() if tok]
        stmt = stmt.where(
            or_(
                Application.cover_note.ilike(like),
                Application.skills.op("&&")(skill_tokens),
            )
        )

    if f.sort is ApplicantSort.expected_ctc:
        stmt = stmt.order_by(Application.expected_ctc.asc())
    elif f.sort is ApplicantSort.notice:
        stmt = stmt.order_by(Application.notice_period_days.asc())
    elif f.sort is ApplicantSort.experience:
        stmt = stmt.order_by(Application.years_experience.desc())
    else:
        stmt = stmt.order_by(Application.created_at.desc())
    return stmt


def filters_from_query(
    stage: ApplicationStage | None,
    skills_any: list[str] | None,
    skills_all: list[str] | None,
    exp_min: int | None,
    exp_max: int | None,
    current_ctc_min: int | None,
    current_ctc_max: int | None,
    expected_ctc_min: int | None,
    expected_ctc_max: int | None,
    notice_max_days: int | None,
    applied_after: date | None,
    applied_before: date | None,
    q: str | None,
    sort: ApplicantSort,
) -> ApplicantFilters:
    return ApplicantFilters(
        stage=stage,
        skills_any=skills_any,
        skills_all=skills_all,
        exp_min=exp_min,
        exp_max=exp_max,
        current_ctc_min=current_ctc_min,
        current_ctc_max=current_ctc_max,
        expected_ctc_min=expected_ctc_min,
        expected_ctc_max=expected_ctc_max,
        notice_max_days=notice_max_days,
        applied_after=applied_after,
        applied_before=applied_before,
        q=q,
        sort=sort,
    )


# FastAPI-style query-params dependency. `Annotated[ApplicantFilters,
# Depends(applicant_filter_params)]` on a route lets us declare the 14
# filter knobs in exactly one place — discovery + export + the cross-job
# feed all reuse this rather than each redeclaring the same Query()s.
def applicant_filter_params(
    stage: ApplicationStage | None = None,
    skills_any: list[str] | None = _Query(default=None),
    skills_all: list[str] | None = _Query(default=None),
    exp_min: int | None = _Query(default=None, ge=0),
    exp_max: int | None = _Query(default=None, ge=0),
    current_ctc_min: int | None = _Query(default=None, ge=0),
    current_ctc_max: int | None = _Query(default=None, ge=0),
    expected_ctc_min: int | None = _Query(default=None, ge=0),
    expected_ctc_max: int | None = _Query(default=None, ge=0),
    notice_max_days: int | None = _Query(default=None, ge=0),
    applied_after: date | None = None,
    applied_before: date | None = None,
    q: str | None = None,
    sort: ApplicantSort = ApplicantSort.recent,
) -> ApplicantFilters:
    return filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )


# ---------- stage-transition helper ----------


def transition_stage(
    db: Session,
    application: Application,
    new_stage: ApplicationStage,
    *,
    by_user: User,
) -> Application | None:
    """Move an application to `new_stage`, append the audit event, commit.

    Returns the application (refreshed) so the caller can serialise it.
    Returns the same row untouched if `new_stage` equals the current
    stage — the audit log only gets an entry on an actual transition.
    """
    if new_stage == application.stage:
        return application
    previous = application.stage
    application.stage = new_stage
    db.add(
        ApplicationEvent(
            application_id=application.id,
            from_stage=previous,
            to_stage=new_stage,
            changed_by_user_id=by_user.id,
        )
    )
    db.commit()
    db.refresh(application)
    return application
