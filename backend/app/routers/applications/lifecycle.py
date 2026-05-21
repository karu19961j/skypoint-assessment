"""Endpoints that act on a single application's lifecycle.

  - POST  /                       — apply
  - GET   /mine                   — candidate's own list
  - DELETE /{id}                  — withdraw (Applied stage only)
  - GET   /{id}                   — full detail with identity (Profile drawer)
  - PATCH /{id}/stage             — HR moves between stages
  - GET   /{id}/timeline          — immutable stage history
  - GET   /{id}/notes             — HR-only notes list
  - POST  /{id}/notes             — HR-only note create
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
)
from app.services.resume_text import extract_text
from app.services.storage import get_storage
from app.sorts import MyApplicationSort

from ._helpers import (
    STAGE_TRANSITIONS,
    detail,
    ensure_can_view_application,
    ensure_candidate_owns_application,
    ensure_hr_owns_application,
    get_application_or_404,
    is_allowed_transition,
    transition_stage,
)

router = APIRouter()


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
        raise HTTPException(
            status_code=400, detail="This job is not accepting applications."
        )
    # Deadline guard — silently honoring a closed-by-date posting would
    # mislead the candidate.
    if job.deadline is not None and job.deadline < datetime.now(timezone.utc).date():
        raise HTTPException(
            status_code=400,
            detail="The application deadline for this job has passed.",
        )

    duplicate = db.scalar(
        select(Application).where(
            Application.job_id == payload.job_id,
            Application.candidate_id == current_user.id,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409, detail="You have already applied to this job."
        )

    # Resolve the resume key (if any) against the storage backend. Two
    # guarantees: (1) the key belongs to this candidate (the prefix on
    # upload encodes user id), (2) the object actually exists. The
    # candidate can apply without a resume — many internal-mobility flows
    # work that way — so a missing key isn't an error here.
    resume_meta: dict[str, object] = {
        "resume_key": None,
        "resume_filename": None,
        "resume_size_bytes": None,
        "resume_content_type": None,
        "resume_text": None,
    }
    if payload.resume_key:
        expected_prefix = f"resumes/{current_user.id}/"
        if not payload.resume_key.startswith(expected_prefix):
            raise HTTPException(
                status_code=403, detail="That resume does not belong to you."
            )
        stored = get_storage().head_object(payload.resume_key)
        if stored is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The uploaded resume could not be found. "
                    "Please re-upload before submitting."
                ),
            )
        # Re-extract here so resume_text on the application row reflects
        # the file the candidate actually committed (the upload endpoint
        # already stored it but we keep things consistent if the upload
        # was reused across attempts).
        body_chunks = list(get_storage().iter_object(payload.resume_key))
        body = b"".join(body_chunks)
        resume_meta.update(
            resume_key=payload.resume_key,
            resume_filename=stored.filename,
            resume_size_bytes=stored.size,
            resume_content_type=stored.content_type,
            resume_text=extract_text(filename=stored.filename or "", body=body) or None,
        )

    application = Application(
        job_id=payload.job_id,
        candidate_id=current_user.id,
        cover_note=payload.cover_note,
        current_ctc=payload.current_ctc,
        expected_ctc=payload.expected_ctc,
        notice_period_days=payload.notice_period_days,
        years_experience=payload.years_experience,
        skills=[s.strip() for s in payload.skills if s and s.strip()],
        stage=ApplicationStage.applied,
        **resume_meta,
    )
    db.add(application)
    try:
        db.flush()
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
        # Race: another concurrent POST inserted the same (job_id, candidate_id)
        # between our SELECT and INSERT. The unique constraint is the source
        # of truth — translate it back into the 409 the SELECT path raises.
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
    sort: MyApplicationSort = MyApplicationSort.recent,
) -> list[ApplicationDetail]:
    stmt = select(Application).where(Application.candidate_id == current_user.id)
    if stage is not None:
        stmt = stmt.where(Application.stage == stage)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.join(Job).where(Job.title.ilike(like))

    if sort is MyApplicationSort.updated:
        stmt = stmt.order_by(Application.updated_at.desc())
    else:
        stmt = stmt.order_by(Application.created_at.desc())

    apps = db.scalars(stmt).all()
    # `/mine` is the candidate's own application list — include identity so
    # the My Applications page can show job titles + their own resume link.
    return [detail(a, include_identity=True) for a in apps]


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_application(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> None:
    app = get_application_or_404(db, application_id)
    ensure_candidate_owns_application(app, current_user)
    if app.stage != ApplicationStage.applied:
        raise HTTPException(
            status_code=400,
            detail="You can only withdraw while in the Applied stage.",
        )
    db.delete(app)
    db.commit()


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application_detail(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate, UserRole.hr))],
) -> ApplicationDetail:
    """Full application detail INCLUDING identity (name, email, resume).

    The list endpoints (`/by-job`, `/all`, `/by-job/:id/ranked`) anonymize
    their responses so the HR discovery surface stays bias-free even at
    the network-tab level. This endpoint is the explicit "I'm opening the
    profile" call — and only here do we return identifying fields.

    The discovery + export sub-routers are included before lifecycle in
    the package __init__, so FastAPI matches `/all` and `/by-job/...`
    before this catch-all `/{application_id}` route.
    """
    app = get_application_or_404(db, application_id)
    ensure_can_view_application(app, current_user)
    return detail(app, include_identity=True)


@router.patch("/{application_id}/stage", response_model=ApplicationDetail)
def update_stage(
    application_id: int,
    payload: ApplicationStageUpdate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> ApplicationDetail:
    app = get_application_or_404(db, application_id)
    ensure_hr_owns_application(app, current_user)
    if not is_allowed_transition(app.stage, payload.stage):
        # Surface both the bad transition AND the valid options so the
        # frontend (and curl-via-docs caller) can recover without guessing.
        allowed = sorted(s.value for s in STAGE_TRANSITIONS[app.stage])
        allowed_msg = (
            ", ".join(allowed) if allowed else "(none — stage is terminal)"
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot transition from '{app.stage.value}' to "
                f"'{payload.stage.value}'. Allowed next stages: {allowed_msg}."
            ),
        )
    transition_stage(db, app, payload.stage, by_user=current_user)
    return detail(app)


@router.get("/{application_id}/timeline", response_model=list[ApplicationEventOut])
def get_timeline(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate, UserRole.hr))],
) -> list[ApplicationEventOut]:
    """Immutable stage-change history for an application.

    Candidates see their own application timeline; HR sees timelines for
    applications on the jobs they own.
    """
    app = get_application_or_404(db, application_id)
    ensure_can_view_application(app, current_user)

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
    app = get_application_or_404(db, application_id)
    ensure_hr_owns_application(app, current_user)
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
    app = get_application_or_404(db, application_id)
    ensure_hr_owns_application(app, current_user)
    note = ApplicationNote(
        application_id=application_id,
        hr_id=current_user.id,
        body=payload.body.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return ApplicationNoteOut.model_validate(note)
