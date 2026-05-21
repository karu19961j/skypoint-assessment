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

# How many entries to surface in the "top jobs by applications" section.
TOP_JOBS_COUNT = 5
# Rolling-window length for the "applications received recently" stat.
ACTIVITY_WINDOW_DAYS = 7


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

    # 2) Applications today / rolling 7-day window (across HR's jobs).
    now = datetime.now(timezone.utc)
    start_of_today = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    # Inclusive of today → subtract (window - 1) days.
    start_of_window = start_of_today - timedelta(days=ACTIVITY_WINDOW_DAYS - 1)

    own_jobs_subq = select(Job.id).where(Job.hr_id == current_user.id).scalar_subquery()

    today_count = db.scalar(
        select(func.count(Application.id))
        .where(Application.job_id.in_(own_jobs_subq))
        .where(Application.created_at >= start_of_today)
    ) or 0
    week_count = db.scalar(
        select(func.count(Application.id))
        .where(Application.job_id.in_(own_jobs_subq))
        .where(Application.created_at >= start_of_window)
    ) or 0

    activity = ApplicationActivity(today=today_count, this_week=week_count)
    # `this_week` is a rolling 7-day window (today + previous 6 days),
    # not the ISO calendar week. The frontend label says "Apps in last 7
    # days" to match.

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

    funnels = list(grouped.values())

    # "Top 5 jobs by applications" surfaces where the HR's attention should
    # go right now. A closed job — even one that had high volume historically
    # — has no actionable pipeline left, so filter it out before slicing.
    # Active + Paused jobs both have live pipelines worth surfacing.
    live_job_ids = {
        j_id
        for j_id, j_status in db.execute(
            select(Job.id, Job.status).where(Job.hr_id == current_user.id)
        ).all()
        if j_status != JobStatus.closed
    }
    top_jobs = sorted(
        (f for f in funnels if f.job_id in live_job_ids),
        key=lambda f: f.total,
        reverse=True,
    )[:TOP_JOBS_COUNT]
    return DashboardOut(
        jobs=counts,
        applications=activity,
        funnels=funnels,
        top_jobs=top_jobs,
    )
