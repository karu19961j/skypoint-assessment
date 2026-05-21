from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CandidateProfile(Base, TimestampMixin):
    """One-to-one profile a candidate fills in before applying.

    The profile carries everything the apply form used to ask for —
    skills, experience, CTC expectations, notice period, location
    preferences, prior work + education, and the resume itself. At apply
    time, the backend snapshots this into the `applications` row so
    historical applications keep their state even if the candidate edits
    their profile later.

    `is_fresher=True` zeroes out work-experience inputs on the form;
    `years_experience` + `current_ctc` are persisted as 0 in that case
    and `prior_experience` rows are absent.
    """

    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # ----- core attributes -----
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    is_fresher: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Stored as a string array to dodge "ENUM of ENUMs" complications in
    # Postgres. Pydantic validates each entry as a LocationType on read/write.
    preferred_locations: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )

    # ----- resume on file -----
    # Same key the application snapshots — one resume per candidate that
    # gets carried into every application. Nullable so a freshly-created
    # profile can save before uploading the file.
    resume_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resume_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User")
    experiences = relationship(
        "CandidateExperience",
        back_populates="candidate",
        cascade="all, delete-orphan",
        order_by="CandidateExperience.from_date.desc()",
    )
    educations = relationship(
        "CandidateEducation",
        back_populates="candidate",
        cascade="all, delete-orphan",
        order_by="CandidateEducation.from_year.desc()",
    )


class CandidateExperience(Base, TimestampMixin):
    """One row per prior-job entry on a candidate's profile.

    Hung off the profile (not the user) so deleting the profile cleans
    these up automatically. `is_current=True` means "currently working
    here" and the form's `to_date` widget is disabled in that case.
    """

    __tablename__ = "candidate_experiences"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    candidate = relationship("CandidateProfile", back_populates="experiences")


class CandidateEducation(Base, TimestampMixin):
    """One row per education entry. Years (not full dates) are typically
    what shows up on a resume, so we store year-only and let the form
    surface "2016–2020" style ranges."""

    __tablename__ = "candidate_educations"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    institution: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[str] = mapped_column(String(200), nullable=False)
    field_of_study: Mapped[str | None] = mapped_column(String(200), nullable=True)
    from_year: Mapped[int] = mapped_column(Integer, nullable=False)
    to_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    candidate = relationship("CandidateProfile", back_populates="educations")
