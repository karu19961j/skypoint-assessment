from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, require_role
from app.models import (
    Application,
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
    ApplicationNoteCreate,
    ApplicationNoteOut,
    ApplicationOut,
    ApplicationStageUpdate,
    CandidateMini,
    JobMini,
)

router = APIRouter()


def _detail(application: Application) -> ApplicationDetail:
    return ApplicationDetail(
        **ApplicationOut.model_validate(application).model_dump(),
        job=JobMini.model_validate(application.job) if application.job else None,
        candidate=CandidateMini.model_validate(application.candidate)
        if application.candidate
        else None,
    )


def _get_application_or_404(db: Session, app_id: int) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return app


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
    db.commit()
    db.refresh(application)
    return ApplicationOut.model_validate(application)


@router.get("/mine", response_model=list[ApplicationDetail])
def list_my_applications(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
    stage: ApplicationStage | None = None,
    q: str | None = None,
) -> list[ApplicationDetail]:
    stmt = (
        select(Application)
        .where(Application.candidate_id == current_user.id)
        .order_by(Application.created_at.desc())
    )
    if stage is not None:
        stmt = stmt.where(Application.stage == stage)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.join(Job).where(Job.title.ilike(like))
    apps = db.scalars(stmt).all()
    return [_detail(a) for a in apps]


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

    stmt = select(Application).where(Application.job_id == job_id)

    if stage is not None:
        stmt = stmt.where(Application.stage == stage)
    if skills_any:
        normalized = [s.strip() for s in skills_any if s and s.strip()]
        if normalized:
            stmt = stmt.where(Application.skills.op("&&")(normalized))
    if skills_all:
        normalized = [s.strip() for s in skills_all if s and s.strip()]
        if normalized:
            stmt = stmt.where(Application.skills.op("@>")(normalized))
    if exp_min is not None:
        stmt = stmt.where(Application.years_experience >= exp_min)
    if exp_max is not None:
        stmt = stmt.where(Application.years_experience <= exp_max)
    if current_ctc_min is not None:
        stmt = stmt.where(Application.current_ctc >= current_ctc_min)
    if current_ctc_max is not None:
        stmt = stmt.where(Application.current_ctc <= current_ctc_max)
    if expected_ctc_min is not None:
        stmt = stmt.where(Application.expected_ctc >= expected_ctc_min)
    if expected_ctc_max is not None:
        stmt = stmt.where(Application.expected_ctc <= expected_ctc_max)
    if notice_max_days is not None:
        stmt = stmt.where(Application.notice_period_days <= notice_max_days)
    if applied_after is not None:
        stmt = stmt.where(Application.created_at >= datetime.combine(applied_after, datetime.min.time(), tzinfo=timezone.utc))
    if applied_before is not None:
        stmt = stmt.where(Application.created_at < datetime.combine(applied_before + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                Application.cover_note.ilike(like),
                Application.skills.op("&&")([q.strip()]),
            )
        )

    if sort == "expected_ctc":
        stmt = stmt.order_by(Application.expected_ctc.asc())
    elif sort == "notice":
        stmt = stmt.order_by(Application.notice_period_days.asc())
    elif sort == "experience":
        stmt = stmt.order_by(Application.years_experience.desc())
    else:
        stmt = stmt.order_by(Application.created_at.desc())

    apps = db.scalars(stmt).all()
    return [_detail(a) for a in apps]


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
    app.stage = payload.stage
    db.commit()
    db.refresh(app)
    return _detail(app)


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
