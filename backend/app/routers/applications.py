import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import DbSession, require_role
from app.models import (
    Application,
    ApplicationEvent,
    ApplicationNote,
    ApplicationStage,
    Job,
    JobStatus,
    User,
    UserRole,
)
from app.schemas.application import (
    ApplicationCreate,
    ApplicationDetail,
    ApplicationEventOut,
    ApplicationNoteCreate,
    ApplicationNoteOut,
    ApplicationOut,
    ApplicationStageUpdate,
    CandidateMini,
    JobMini,
    RankedApplicationOut,
    ScoreBreakdownOut,
)
from app.services.ranking import score_application_for_job

router = APIRouter()


def _detail(application: Application, *, include_identity: bool = False) -> ApplicationDetail:
    """Build an ApplicationDetail payload.

    `include_identity=False` (the default for list endpoints) anonymizes
    the response: candidate.full_name / candidate.email / resume_link are
    stripped so the HR discovery view stays bias-free even when inspected
    via the network tab. Use `include_identity=True` only when the caller
    is explicitly asking for the full profile (e.g. GET /applications/:id
    powering the Profile drawer).
    """
    base = ApplicationOut.model_validate(application).model_dump()
    if not include_identity:
        # Remove the resume URL from the list payload too — it can encode
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
    )


def _get_application_or_404(db: Session, app_id: int) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return app


@dataclass
class _ApplicantFilters:
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
    sort: str = "recent"


def _apply_filters(stmt: Select[tuple[Application]], f: _ApplicantFilters) -> Select[tuple[Application]]:
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
            >= datetime.combine(f.applied_after, datetime.min.time(), tzinfo=timezone.utc)
        )
    if f.applied_before is not None:
        stmt = stmt.where(
            Application.created_at
            < datetime.combine(
                f.applied_before + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
            )
        )
    if f.q:
        like = f"%{f.q.lower()}%"
        stmt = stmt.where(
            or_(
                Application.cover_note.ilike(like),
                Application.skills.op("&&")([f.q.strip()]),
            )
        )

    if f.sort == "expected_ctc":
        stmt = stmt.order_by(Application.expected_ctc.asc())
    elif f.sort == "notice":
        stmt = stmt.order_by(Application.notice_period_days.asc())
    elif f.sort == "experience":
        stmt = stmt.order_by(Application.years_experience.desc())
    else:
        stmt = stmt.order_by(Application.created_at.desc())
    return stmt


@router.post("/", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def apply(
    payload: ApplicationCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> ApplicationOut:
    job = db.get(Job, payload.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.active:
        raise HTTPException(status_code=400, detail="This job is not accepting applications.")

    duplicate = db.scalar(
        select(Application).where(
            Application.job_id == payload.job_id,
            Application.candidate_id == current_user.id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="You have already applied to this job.")

    application = Application(
        job_id=payload.job_id,
        candidate_id=current_user.id,
        resume_link=str(payload.resume_link),
        cover_note=payload.cover_note,
        current_ctc=payload.current_ctc,
        expected_ctc=payload.expected_ctc,
        notice_period_days=payload.notice_period_days,
        years_experience=payload.years_experience,
        skills=[s.strip() for s in payload.skills if s and s.strip()],
        stage=ApplicationStage.applied,
    )
    db.add(application)
    try:
        db.flush()  # populate application.id before inserting the event
        db.add(
            ApplicationEvent(
                application_id=application.id,
                from_stage=None,
                to_stage=ApplicationStage.applied,
                changed_by_user_id=current_user.id,
            )
        )
        db.commit()
    except IntegrityError:
        # Race: another request inserted the same (job_id, candidate_id) row
        # between our SELECT and INSERT. The unique constraint is the source
        # of truth — translate it back into the same 409 the SELECT path
        # would have raised.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already applied to this job.",
        ) from None
    db.refresh(application)
    return ApplicationOut.model_validate(application)


@router.get("/mine", response_model=list[ApplicationDetail])
def list_my_applications(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
    stage: ApplicationStage | None = None,
    q: str | None = None,
    sort: str = Query(default="recent", pattern="^(recent|updated)$"),
) -> list[ApplicationDetail]:
    stmt = select(Application).where(Application.candidate_id == current_user.id)
    if stage is not None:
        stmt = stmt.where(Application.stage == stage)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.join(Job).where(Job.title.ilike(like))

    if sort == "updated":
        stmt = stmt.order_by(Application.updated_at.desc())
    else:
        stmt = stmt.order_by(Application.created_at.desc())

    apps = db.scalars(stmt).all()
    # `/mine` is the candidate's own application list — include identity (it's
    # their own data) so they can see job titles + their own application detail.
    return [_detail(a, include_identity=True) for a in apps]


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_application(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> None:
    app = _get_application_or_404(db, application_id)
    if app.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your application.")
    if app.stage != ApplicationStage.applied:
        raise HTTPException(
            status_code=400,
            detail="You can only withdraw while in the Applied stage.",
        )
    db.delete(app)
    db.commit()


def _filters_from_query(
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
    sort: str,
) -> _ApplicantFilters:
    return _ApplicantFilters(
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


@router.get("/by-job/{job_id}", response_model=list[ApplicationDetail])
def list_applicants(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    stage: ApplicationStage | None = None,
    skills_any: list[str] | None = Query(default=None),
    skills_all: list[str] | None = Query(default=None),
    exp_min: int | None = Query(default=None, ge=0),
    exp_max: int | None = Query(default=None, ge=0),
    current_ctc_min: int | None = Query(default=None, ge=0),
    current_ctc_max: int | None = Query(default=None, ge=0),
    expected_ctc_min: int | None = Query(default=None, ge=0),
    expected_ctc_max: int | None = Query(default=None, ge=0),
    notice_max_days: int | None = Query(default=None, ge=0),
    applied_after: date | None = None,
    applied_before: date | None = None,
    q: str | None = None,
    sort: str = Query(
        default="recent",
        pattern="^(recent|expected_ctc|notice|experience)$",
    ),
) -> list[ApplicationDetail]:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this job.")

    filters = _filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )
    stmt = _apply_filters(
        select(Application).where(Application.job_id == job_id), filters
    )
    apps = db.scalars(stmt).all()
    return [_detail(a) for a in apps]


@router.get("/by-job/{job_id}/export")
def export_applicants_csv(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    stage: ApplicationStage | None = None,
    skills_any: list[str] | None = Query(default=None),
    skills_all: list[str] | None = Query(default=None),
    exp_min: int | None = Query(default=None, ge=0),
    exp_max: int | None = Query(default=None, ge=0),
    current_ctc_min: int | None = Query(default=None, ge=0),
    current_ctc_max: int | None = Query(default=None, ge=0),
    expected_ctc_min: int | None = Query(default=None, ge=0),
    expected_ctc_max: int | None = Query(default=None, ge=0),
    notice_max_days: int | None = Query(default=None, ge=0),
    applied_after: date | None = None,
    applied_before: date | None = None,
    q: str | None = None,
    sort: str = Query(
        default="recent",
        pattern="^(recent|expected_ctc|notice|experience)$",
    ),
) -> StreamingResponse:
    """CSV export of the same filtered applicants the table shows.

    Columns: applicant_id, experience_years, skills, current_ctc,
    expected_ctc, notice_period_days, stage, applied_date. Identity
    fields (name, email, resume) are intentionally omitted to keep the
    export consistent with the in-app anonymized cards.
    """
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this job.")

    filters = _filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )
    stmt = _apply_filters(
        select(Application).where(Application.job_id == job_id), filters
    )
    apps = db.scalars(stmt).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "applicant_id",
        "experience_years",
        "skills",
        "current_ctc",
        "expected_ctc",
        "notice_period_days",
        "stage",
        "applied_date",
    ])
    for a in apps:
        writer.writerow([
            a.id,
            a.years_experience,
            "; ".join(a.skills),
            a.current_ctc,
            a.expected_ctc,
            a.notice_period_days,
            a.stage.value,
            a.created_at.date().isoformat(),
        ])

    buf.seek(0)
    slug = job.title.lower().replace(" ", "-")
    filename = f"candidates-{slug}-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/by-job/{job_id}/ranked",
    response_model=list[RankedApplicationOut],
)
def list_ranked_applicants(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> list[RankedApplicationOut]:
    """Score every applicant on the job against its requirements and
    return them sorted by total fit score (descending)."""
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this job.")

    apps = db.scalars(
        select(Application).where(Application.job_id == job_id)
    ).all()

    ranked: list[RankedApplicationOut] = []
    for a in apps:
        score = score_application_for_job(
            required_skills=job.skills,
            candidate_skills=a.skills,
            job_exp_min=job.exp_min,
            job_exp_max=job.exp_max,
            job_ctc_min=job.ctc_min,
            job_ctc_max=job.ctc_max,
            candidate_years=a.years_experience,
            candidate_expected_ctc=a.expected_ctc,
            candidate_notice_days=a.notice_period_days,
        )
        detail = _detail(a).model_dump()
        ranked.append(
            RankedApplicationOut(
                **detail,
                score=ScoreBreakdownOut(
                    total=score.total,
                    skill=score.skill,
                    exp=score.exp,
                    ctc=score.ctc,
                    notice=score.notice,
                    location=score.location,
                    matched_skills=score.matched_skills,
                ),
            )
        )

    ranked.sort(key=lambda r: r.score.total, reverse=True)
    return ranked


@router.get("/all", response_model=list[ApplicationDetail])
def list_all_my_applicants(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    job_id: int | None = Query(default=None, description="Scope to a single job (must be owned by the HR)."),
    stage: ApplicationStage | None = None,
    skills_any: list[str] | None = Query(default=None),
    skills_all: list[str] | None = Query(default=None),
    exp_min: int | None = Query(default=None, ge=0),
    exp_max: int | None = Query(default=None, ge=0),
    current_ctc_min: int | None = Query(default=None, ge=0),
    current_ctc_max: int | None = Query(default=None, ge=0),
    expected_ctc_min: int | None = Query(default=None, ge=0),
    expected_ctc_max: int | None = Query(default=None, ge=0),
    notice_max_days: int | None = Query(default=None, ge=0),
    applied_after: date | None = None,
    applied_before: date | None = None,
    q: str | None = None,
    sort: str = Query(
        default="recent",
        pattern="^(recent|expected_ctc|notice|experience)$",
    ),
) -> list[ApplicationDetail]:
    """Cross-job applicant feed for the requesting HR.

    Returns every application on every job owned by the requesting HR,
    optionally scoped to a specific `job_id` (which must also be owned by
    them). Same filter and sort surface as `/by-job/{id}`.
    """
    own_jobs_subq = (
        select(Job.id).where(Job.hr_id == current_user.id).scalar_subquery()
    )
    stmt = select(Application).where(Application.job_id.in_(own_jobs_subq))

    if job_id is not None:
        job = db.get(Job, job_id)
        if job is None or job.hr_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this job.",
            )
        stmt = stmt.where(Application.job_id == job_id)

    filters = _filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )
    stmt = _apply_filters(stmt, filters)
    apps = db.scalars(stmt).all()
    return [_detail(a) for a in apps]


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application_detail(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate, UserRole.hr))],
) -> ApplicationDetail:
    """Full application detail INCLUDING identity (name, email, resume).

    The list endpoints (`/by-job`, `/all`, `/by-job/:id/ranked`) deliberately
    anonymize their responses so the HR discovery surface stays bias-free
    even at the network-tab level. This endpoint is the explicit "I'm
    opening the profile" call — the HR clicked View Profile, or the
    candidate is viewing their own application — and only here do we
    return the identifying fields.

    Registered after the literal /all and /by-job/... routes so FastAPI
    matches those by exact path rather than this catch-all parameter.
    """
    app = _get_application_or_404(db, application_id)
    if current_user.role == UserRole.candidate:
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your application.")
    else:
        if app.job is None or app.job.hr_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not own this application.")
    return _detail(app, include_identity=True)


@router.patch("/{application_id}/stage", response_model=ApplicationDetail)
def update_stage(
    application_id: int,
    payload: ApplicationStageUpdate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> ApplicationDetail:
    app = _get_application_or_404(db, application_id)
    if app.job is None or app.job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this application.")
    if payload.stage != app.stage:
        previous = app.stage
        app.stage = payload.stage
        db.add(
            ApplicationEvent(
                application_id=app.id,
                from_stage=previous,
                to_stage=payload.stage,
                changed_by_user_id=current_user.id,
            )
        )
    db.commit()
    db.refresh(app)
    return _detail(app)


@router.get("/{application_id}/timeline", response_model=list[ApplicationEventOut])
def get_timeline(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate, UserRole.hr))],
) -> list[ApplicationEventOut]:
    """Return the immutable stage-change history for an application.

    Candidates see their own application timeline; HR sees timelines for
    applications on the jobs they own.
    """
    app = _get_application_or_404(db, application_id)

    if current_user.role == UserRole.candidate:
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your application.")
    else:
        if app.job is None or app.job.hr_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not own this application.")

    events = db.scalars(
        select(ApplicationEvent)
        .where(ApplicationEvent.application_id == application_id)
        .order_by(ApplicationEvent.created_at.asc())
    ).all()
    return [ApplicationEventOut.model_validate(e) for e in events]


@router.get("/{application_id}/notes", response_model=list[ApplicationNoteOut])
def list_notes(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> list[ApplicationNoteOut]:
    app = _get_application_or_404(db, application_id)
    if app.job is None or app.job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this application.")
    notes = (
        db.scalars(
            select(ApplicationNote)
            .where(ApplicationNote.application_id == application_id)
            .order_by(ApplicationNote.created_at.desc())
        ).all()
    )
    return [ApplicationNoteOut.model_validate(n) for n in notes]


@router.post(
    "/{application_id}/notes",
    response_model=ApplicationNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_note(
    application_id: int,
    payload: ApplicationNoteCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> ApplicationNoteOut:
    app = _get_application_or_404(db, application_id)
    if app.job is None or app.job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this application.")
    note = ApplicationNote(
        application_id=application_id,
        hr_id=current_user.id,
        body=payload.body.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return ApplicationNoteOut.model_validate(note)
