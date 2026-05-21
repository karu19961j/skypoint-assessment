from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession, require_role
from app.models import CandidateProfile, User, UserRole
from app.schemas.profile import ProfileOut, ProfileUpsert

router = APIRouter()


def _get_profile(db, user_id: int) -> CandidateProfile | None:
    return db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == user_id))


@router.get("/", response_model=ProfileOut | None)
def get_profile(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> ProfileOut | None:
    """Return the candidate's profile, or null if they haven't set one yet."""
    profile = _get_profile(db, current_user.id)
    if profile is None:
        return None
    return ProfileOut.model_validate(profile)


@router.put("/", response_model=ProfileOut)
def upsert_profile(
    payload: ProfileUpsert,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> ProfileOut:
    """Create or update the candidate's profile in place."""
    profile = _get_profile(db, current_user.id)
    if profile is None:
        profile = CandidateProfile(user_id=current_user.id)
        db.add(profile)

    profile.skills = payload.skills
    profile.years_experience = payload.years_experience
    profile.expected_ctc = payload.expected_ctc
    profile.preferred_locations = [loc.value for loc in payload.preferred_locations]

    db.commit()
    db.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> None:
    """Clear the saved profile so recommendations stop showing."""
    profile = _get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No profile to delete."
        )
    db.delete(profile)
    db.commit()
