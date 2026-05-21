from datetime import datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.deps import DbSession, require_role
from app.models import Application, ApplicationStage, Job, JobStatus, User, UserRole
from app.schemas.dashboard import (
    ApplicationActivity,
    DashboardOut,
    JobFunnelEntry,
    JobStatusCounts,
)

router = APIRouter()


@router.get("/hr", response_model=DashboardOut)
def hr_dashboard(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> DashboardOut:
    # 1) Job counts by status (HR's own jobs).
    status_rows = db.execute(
        select(Job.status, func.count(Job.id))
        .where(Job.hr_id == current_user.id)
        .group_by(Job.status)
    ).all()
    counts = JobStatusCounts()
    for row_status, n in status_rows:
        setattr(counts, row_status.value, n)

    # 2) Applications today / this week (across HR's jobs).
    now = datetime.now(timezone.utc)
    start_of_today = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    start_of_week = start_of_today - timedelta(days=6)

    own_jobs_subq = select(Job.id).where(Job.hr_id == current_user.id).scalar_subquery()

    today_count = db.scalar(
        select(func.count(Application.id))
        .where(Application.job_id.in_(own_jobs_subq))
        .where(Application.created_at >= start_of_today)
    ) or 0
    week_count = db.scalar(
        select(func.count(Application.id))
        .where(Application.job_id.in_(own_jobs_subq))
        .where(Application.created_at >= start_of_week)
    ) or 0

    activity = ApplicationActivity(today=today_count, this_week=week_count)

    # 3) Per-job stage funnel.
    funnel_rows = db.execute(
        select(Job.id, Job.title, Application.stage, func.count(Application.id))
        .join(Application, Application.job_id == Job.id, isouter=True)
        .where(Job.hr_id == current_user.id)
        .group_by(Job.id, Job.title, Application.stage)
        .order_by(Job.created_at.desc())
    ).all()

    grouped: dict[int, JobFunnelEntry] = {}
    for job_id, title, stage, n in funnel_rows:
        entry = grouped.setdefault(
            job_id,
            JobFunnelEntry(
                job_id=job_id,
                title=title,
                counts={s: 0 for s in ApplicationStage},
                total=0,
            ),
        )
        if stage is not None:
            entry.counts[stage] = n
            entry.total += n

    return DashboardOut(jobs=counts, applications=activity, funnels=list(grouped.values()))
