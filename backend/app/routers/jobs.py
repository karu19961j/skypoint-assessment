from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, require_role
from app.models import EmploymentType, Job, JobStatus, LocationType, User, UserRole
from app.schemas.job import JobCreate, JobOut, JobStatusUpdate, JobUpdate

router = APIRouter()


def _get_job_or_404(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _ensure_owner(job: Job, user: User) -> None:
    if job.hr_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this job."
        )


@router.get("/", response_model=list[JobOut])
def list_jobs(
    db: DbSession,
    current_user: CurrentUser,
    q: str | None = None,
    location_type: LocationType | None = None,
    employment_type: EmploymentType | None = None,
    department: str | None = None,
    exp_min: int | None = Query(default=None, ge=0),
    exp_max: int | None = Query(default=None, ge=0),
    ctc_min: int | None = Query(default=None, ge=0),
    ctc_max: int | None = Query(default=None, ge=0),
    skills: list[str] | None = Query(default=None),
    job_status: JobStatus | None = Query(default=None, alias="status"),
    mine: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[JobOut]:
    stmt = select(Job)

    # Candidates only see active jobs; HR can see everything.
    if current_user.role == UserRole.candidate:
        stmt = stmt.where(Job.status == JobStatus.active)
    elif mine:
        stmt = stmt.where(Job.hr_id == current_user.id)

    if job_status is not None and current_user.role == UserRole.hr:
        stmt = stmt.where(Job.status == job_status)

    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(Job.title.ilike(like), Job.description.ilike(like), Job.department.ilike(like))
        )
    if location_type is not None:
        stmt = stmt.where(Job.location_type == location_type)
    if employment_type is not None:
        stmt = stmt.where(Job.employment_type == employment_type)
    if department:
        stmt = stmt.where(Job.department.ilike(department))
    if exp_min is not None:
        stmt = stmt.where(Job.exp_max >= exp_min)
    if exp_max is not None:
        stmt = stmt.where(Job.exp_min <= exp_max)
    if ctc_min is not None:
        stmt = stmt.where(Job.ctc_max >= ctc_min)
    if ctc_max is not None:
        stmt = stmt.where(Job.ctc_min <= ctc_max)
    if skills:
        normalized = [s.strip() for s in skills if s and s.strip()]
        if normalized:
            stmt = stmt.where(Job.skills.op("&&")(normalized))

    stmt = stmt.order_by(Job.created_at.desc()).limit(limit).offset(offset)
    jobs = db.scalars(stmt).all()
    return [JobOut.model_validate(j) for j in jobs]


@router.post("/", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> JobOut:
    job = Job(
        hr_id=current_user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        department=payload.department.strip(),
        location_type=payload.location_type,
        employment_type=payload.employment_type,
        exp_min=payload.exp_min,
        exp_max=payload.exp_max,
        ctc_min=payload.ctc_min,
        ctc_max=payload.ctc_max,
        skills=payload.skills,
        deadline=payload.deadline,
        status=JobStatus.active,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return JobOut.model_validate(job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: DbSession, current_user: CurrentUser) -> JobOut:
    job = _get_job_or_404(db, job_id)
    if current_user.role == UserRole.candidate and job.status != JobStatus.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobOut.model_validate(job)


@router.patch("/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    payload: JobUpdate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> JobOut:
    job = _get_job_or_404(db, job_id)
    _ensure_owner(job, current_user)

    data = payload.model_dump(exclude_unset=True)
    if "skills" in data and data["skills"] is not None:
        data["skills"] = [s.strip() for s in data["skills"] if s and s.strip()]

    new_exp_min = data.get("exp_min", job.exp_min)
    new_exp_max = data.get("exp_max", job.exp_max)
    if new_exp_max < new_exp_min:
        raise HTTPException(status_code=422, detail="exp_max must be >= exp_min")
    new_ctc_min = data.get("ctc_min", job.ctc_min)
    new_ctc_max = data.get("ctc_max", job.ctc_max)
    if new_ctc_max < new_ctc_min:
        raise HTTPException(status_code=422, detail="ctc_max must be >= ctc_min")

    for k, v in data.items():
        setattr(job, k, v)

    db.commit()
    db.refresh(job)
    return JobOut.model_validate(job)


@router.patch("/{job_id}/status", response_model=JobOut)
def update_job_status(
    job_id: int,
    payload: JobStatusUpdate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> JobOut:
    job = _get_job_or_404(db, job_id)
    _ensure_owner(job, current_user)
    job.status = payload.status
    db.commit()
    db.refresh(job)
    return JobOut.model_validate(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
) -> None:
    job = _get_job_or_404(db, job_id)
    _ensure_owner(job, current_user)
    db.delete(job)
    db.commit()
