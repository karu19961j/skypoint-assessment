from pydantic import BaseModel

from app.models import ApplicationStage, JobStatus


class JobStatusCounts(BaseModel):
    active: int = 0
    paused: int = 0
    closed: int = 0


class ApplicationActivity(BaseModel):
    today: int = 0
    this_week: int = 0


class JobFunnelEntry(BaseModel):
    job_id: int
    title: str
    counts: dict[ApplicationStage, int]
    total: int


class DashboardOut(BaseModel):
    jobs: JobStatusCounts
    applications: ApplicationActivity
    funnels: list[JobFunnelEntry]
    # Top 5 of the same funnels, sorted by total application count desc.
    # Always a subset of `funnels`, surfaced separately so the UI can render
    # "Top jobs by applications" without re-sorting client-side.
    top_jobs: list[JobFunnelEntry]
