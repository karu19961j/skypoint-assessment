import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow


class ApplicationStage(str, enum.Enum):
    applied = "applied"
    screening = "screening"
    interview = "interview"
    offer = "offer"
    hired = "hired"
    rejected = "rejected"


class Application(Base, TimestampMixin):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("job_id", "candidate_id", name="uq_application_job_candidate"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resume_link: Mapped[str] = mapped_column(String(500), nullable=False)
    cover_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    current_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    stage: Mapped[ApplicationStage] = mapped_column(
        Enum(ApplicationStage, name="application_stage"),
        nullable=False,
        default=ApplicationStage.applied,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    job = relationship("Job", back_populates="applications")
    candidate = relationship("User")
    notes = relationship(
        "ApplicationNote", back_populates="application", cascade="all, delete-orphan"
    )


class ApplicationNote(Base, TimestampMixin):
    __tablename__ = "application_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hr_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    application = relationship("Application", back_populates="notes")
    hr = relationship("User")
