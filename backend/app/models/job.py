import enum
from datetime import date

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class LocationType(str, enum.Enum):
    remote = "remote"
    hybrid = "hybrid"
    onsite = "onsite"


class EmploymentType(str, enum.Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    internship = "internship"


class JobStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    closed = "closed"


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_skills_gin", "skills", postgresql_using="gin"),
        # Defense-in-depth: Pydantic already enforces these on the input
        # path, but a CHECK at the DB level catches any future code that
        # bypasses the schema (raw SQL migrations, ETL imports, etc.).
        CheckConstraint("exp_max >= exp_min", name="ck_jobs_exp_range"),
        CheckConstraint("ctc_max >= ctc_min", name="ck_jobs_ctc_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hr_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    location_type: Mapped[LocationType] = mapped_column(
        Enum(LocationType, name="location_type"), nullable=False, index=True
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        Enum(EmploymentType, name="employment_type"), nullable=False, index=True
    )
    exp_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exp_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ctc_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ctc_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"), nullable=False, default=JobStatus.active, index=True
    )

    hr = relationship("User")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")
