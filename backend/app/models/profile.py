from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CandidateProfile(Base, TimestampMixin):
    """One-to-one profile a candidate can fill in to get personalised job
    recommendations. Skills, years of experience, expected CTC, and one or
    more preferred location types fan into the same scoring engine that
    powers HR's candidate ranking — see `app/services/ranking.py`."""

    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_ctc: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Stored as a string array to dodge "ENUM of ENUMs" complications in
    # Postgres. Pydantic validates each entry as a LocationType on read/write.
    preferred_locations: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )

    user = relationship("User")
