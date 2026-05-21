"""HR-facing application discovery endpoints.

  - GET /by-job/{job_id}          — applicants for one job, with filters
  - GET /by-job/{job_id}/ranked   — same set, scored + sorted by AI fit
  - GET /all                      — cross-job feed for the requesting HR

All endpoints anonymize the response — the identity fields live on the
detail endpoint in `lifecycle.py` and only surface when HR explicitly
opens the Profile drawer.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.deps import DbSession, require_role
from app.models import Application, ApplicationStage, Job, User, UserRole
from app.schemas.application import (
    ApplicationDetail,
    RankedApplicationOut,
    ScoreBreakdownOut,
)
from app.services.ranking import score_application_for_job
from app.sorts import ApplicantSort

from ._helpers import apply_filters, detail, filters_from_query

router = APIRouter()


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
    sort: ApplicantSort = ApplicantSort.recent,
) -> list[ApplicationDetail]:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.hr_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this job.")

    filters = filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )
    stmt = apply_filters(
        select(Application).where(Application.job_id == job_id), filters
    )
    apps = db.scalars(stmt).all()
    return [detail(a) for a in apps]


@router.get("/by-job/{job_id}/ranked", response_model=list[RankedApplicationOut])
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
        ranked.append(
            RankedApplicationOut(
                **detail(a).model_dump(),
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
    job_id: int | None = Query(
        default=None,
        description="Scope to a single job (must be owned by the HR).",
    ),
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
    sort: ApplicantSort = ApplicantSort.recent,
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

    filters = filters_from_query(
        stage, skills_any, skills_all, exp_min, exp_max,
        current_ctc_min, current_ctc_max, expected_ctc_min, expected_ctc_max,
        notice_max_days, applied_after, applied_before, q, sort,
    )
    stmt = apply_filters(stmt, filters)
    apps = db.scalars(stmt).all()
    return [detail(a) for a in apps]
