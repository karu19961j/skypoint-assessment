"""HR-facing application discovery endpoints.

  - GET /by-job/{job_id}          — applicants for one job, with filters
  - GET /by-job/{job_id}/ranked   — same set, scored + sorted by AI fit
  - GET /all                      — cross-job feed for the requesting HR

All endpoints anonymize the response — the identity fields live on the
detail endpoint in `lifecycle.py` and only surface when HR explicitly
opens the Profile drawer.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.deps import DbSession, require_role
from app.models import Application, Job, User, UserRole
from app.schemas.application import (
    ApplicationDetail,
    RankedApplicationOut,
    ScoreBreakdownOut,
)
from app.services.ranking import score_application_for_job

from ._helpers import (
    ApplicantFilters,
    applicant_filter_params,
    apply_filters,
    detail,
    get_hr_owned_job_or_403,
)

router = APIRouter()


def _set_total_header(response: Response, db, stmt) -> None:
    """Run a count(*) against the filtered statement and stash it on
    the `X-Total-Count` response header. Order-by stripped so Postgres
    doesn't bother computing it for the count."""
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0
    response.headers["X-Total-Count"] = str(total)


@router.get("/by-job/{job_id}", response_model=list[ApplicationDetail])
def list_applicants(
    job_id: int,
    response: Response,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    filters: Annotated[ApplicantFilters, Depends(applicant_filter_params)],
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ApplicationDetail]:
    get_hr_owned_job_or_403(db, job_id, current_user)
    stmt = apply_filters(
        select(Application).where(Application.job_id == job_id), filters
    )
    _set_total_header(response, db, stmt)
    apps = db.scalars(stmt.limit(limit).offset(offset)).all()
    return [detail(a) for a in apps]


@router.get("/by-job/{job_id}/ranked", response_model=list[RankedApplicationOut])
def list_ranked_applicants(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> list[RankedApplicationOut]:
    """Score every applicant on the job against its requirements and
    return them sorted by total fit score (descending)."""
    job = get_hr_owned_job_or_403(db, job_id, current_user)

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
    response: Response,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    filters: Annotated[ApplicantFilters, Depends(applicant_filter_params)],
    job_id: int | None = Query(
        default=None,
        description="Scope to a single job (must be owned by the HR).",
    ),
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
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
        # 403 (rather than 404) when the job exists but isn't owned by the
        # caller — avoids leaking "this id exists" to an HR who can't see it.
        job = db.get(Job, job_id)
        if job is None or job.hr_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this job.",
            )
        stmt = stmt.where(Application.job_id == job_id)

    stmt = apply_filters(stmt, filters)
    _set_total_header(response, db, stmt)
    apps = db.scalars(stmt.limit(limit).offset(offset)).all()
    return [detail(a) for a in apps]
