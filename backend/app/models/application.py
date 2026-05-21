import enum
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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


# Shared Postgres enum type: declared once so we don't try to CREATE TYPE
# twice (Application.stage + ApplicationEvent.from_stage / to_stage).
_application_stage_enum = Enum(ApplicationStage, name="application_stage")


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
    # Resume is stored in MinIO under `resume_key`; the row keeps just
    # enough metadata to render filename + size and to seed text-based
    # filtering. `resume_text` is the extracted plain text (empty when
    # extraction isn't possible — e.g. legacy .doc — so keyword search
    # quietly misses those rather than erroring).
    resume_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resume_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    current_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    stage: Mapped[ApplicationStage] = mapped_column(
        _application_stage_enum,
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
    events = relationship(
        "ApplicationEvent",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="ApplicationEvent.created_at",
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


class ApplicationEvent(Base, TimestampMixin):
    """Immutable audit row for every stage transition (including the initial apply)."""

    __tablename__ = "application_events"
    __table_args__ = (
        # The timeline endpoint orders by created_at within a single
        # application_id — covered by this composite index.
        Index("ix_app_events_app_time", "application_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_stage: Mapped[ApplicationStage | None] = mapped_column(
        _application_stage_enum, nullable=True
    )
    to_stage: Mapped[ApplicationStage] = mapped_column(
        _application_stage_enum, nullable=False
    )
    changed_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    application = relationship("Application", back_populates="events")
    changed_by = relationship("User")
