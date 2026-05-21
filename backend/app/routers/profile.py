"""Candidate profile CRUD.

The profile is the heart of the candidate flow — it carries everything
the apply form used to ask for (skills, experience, CTC expectations,
notice, preferred locations, prior work, education, the resume itself)
so applying to a job is just one click + an optional cover note.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

logger = logging.getLogger(__name__)

from app.deps import DbSession, require_role
from app.models import (
    CandidateEducation,
    CandidateExperience,
    CandidateProfile,
    User,
    UserRole,
)
from app.schemas.profile import ProfileOut, ProfileResumeOut, ProfileUpsert
from app.services.resume_text import extract_text
from app.services.storage import get_storage

router = APIRouter()


def _load_profile(db: Session, user_id: int) -> CandidateProfile | None:
    """Profile + the two related rowsets in one round trip. selectinload
    is the right loading strategy here — both relationships are small
    fan-outs (5–10 rows each) and the candidate's profile page renders
    everything together."""
    return db.scalar(
        select(CandidateProfile)
        .where(CandidateProfile.user_id == user_id)
        .options(
            selectinload(CandidateProfile.experiences),
            selectinload(CandidateProfile.educations),
        )
    )


def _profile_to_out(profile: CandidateProfile) -> ProfileOut:
    """Hand-roll the response so the nested resume-meta + experience +
    education shapes line up with what the frontend expects. Easier than
    coercing Pydantic from_attributes to do nested field renames."""
    resume = (
        ProfileResumeOut(
            key=profile.resume_key,
            filename=profile.resume_filename,
            size_bytes=profile.resume_size_bytes,
            content_type=profile.resume_content_type,
        )
        if profile.resume_key
        else None
    )
    return ProfileOut(
        skills=list(profile.skills or []),
        is_fresher=profile.is_fresher,
        years_experience=profile.years_experience,
        current_ctc=profile.current_ctc,
        expected_ctc=profile.expected_ctc,
        notice_period_days=profile.notice_period_days,
        preferred_locations=list(profile.preferred_locations or []),
        experiences=list(profile.experiences),
        educations=list(profile.educations),
        resume=resume,
        created_at=profile.created_at,
    )


@router.get("/", response_model=ProfileOut | None)
def get_profile(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> ProfileOut | None:
    """Return the candidate's profile, or null if they haven't set one yet."""
    profile = _load_profile(db, current_user.id)
    if profile is None:
        return None
    return _profile_to_out(profile)


@router.put("/", response_model=ProfileOut)
def upsert_profile(
    payload: ProfileUpsert,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> ProfileOut:
    """Create or update the candidate's profile in place.

    Experiences + educations are replaced wholesale on each PUT — the
    payload represents the candidate's full current state, not a delta.
    Less ceremony than diff-and-patch, and matches what the form does
    (re-submits everything on Save).
    """
    profile = _load_profile(db, current_user.id)
    is_new = profile is None
    if profile is None:
        profile = CandidateProfile(user_id=current_user.id)
        db.add(profile)
        db.flush()  # need profile.id before we attach experiences/educations

    profile.skills = payload.skills
    profile.is_fresher = payload.is_fresher
    profile.years_experience = payload.years_experience
    profile.current_ctc = payload.current_ctc
    profile.expected_ctc = payload.expected_ctc
    profile.notice_period_days = payload.notice_period_days
    profile.preferred_locations = [loc.value for loc in payload.preferred_locations]

    # Resume key: validate ownership before binding to the profile.
    if payload.resume_key is None:
        # Explicit unset — candidate cleared their resume.
        profile.resume_key = None
        profile.resume_filename = None
        profile.resume_size_bytes = None
        profile.resume_content_type = None
        profile.resume_text = None
    elif payload.resume_key != profile.resume_key:
        expected_prefix = f"resumes/{current_user.id}/"
        if not payload.resume_key.startswith(expected_prefix):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="That resume does not belong to you.",
            )
        stored = get_storage().head_object(payload.resume_key)
        if stored is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded resume could not be found. Please re-upload.",
            )
        body = b"".join(get_storage().iter_object(payload.resume_key))
        profile.resume_key = payload.resume_key
        profile.resume_filename = stored.filename
        profile.resume_size_bytes = stored.size
        profile.resume_content_type = stored.content_type
        profile.resume_text = (
            extract_text(filename=stored.filename or "", body=body) or None
        )

    # Replace experiences + educations wholesale. Cascade on the
    # relationship handles delete; new rows attach via the back-populate.
    if not is_new:
        profile.experiences.clear()
        profile.educations.clear()
        db.flush()

    for exp in payload.experiences:
        profile.experiences.append(
            CandidateExperience(
                company=exp.company.strip(),
                role=exp.role.strip(),
                from_date=exp.from_date,
                to_date=exp.to_date,
                is_current=exp.is_current,
                description=(exp.description or "").strip() or None,
            )
        )
    for edu in payload.educations:
        profile.educations.append(
            CandidateEducation(
                institution=edu.institution.strip(),
                degree=edu.degree.strip(),
                field_of_study=(edu.field_of_study or "").strip() or None,
                from_year=edu.from_year,
                to_year=edu.to_year,
            )
        )

    db.commit()
    db.refresh(profile)
    return _profile_to_out(profile)


@router.get("/resume")
def get_own_resume(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> StreamingResponse:
    """Stream the candidate's own profile resume back.

    Owner-implicit (we use current_user.id, no resource path). `Content-
    Disposition: inline` so browsers preview PDFs in a new tab instead
    of forcing a download — the candidate is checking what they uploaded,
    not saving it. DOCX falls back to the browser's default handler.
    """
    profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    if profile is None or not profile.resume_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume on file.",
        )

    storage = get_storage()
    stored = storage.head_object(profile.resume_key)
    if stored is None:
        logger.error(
            "Resume key %r referenced by profile %s is missing from storage.",
            profile.resume_key,
            profile.id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file is no longer available.",
        )

    filename = stored.filename or profile.resume_filename or "resume"
    return StreamingResponse(
        storage.iter_object(profile.resume_key),
        media_type=stored.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(stored.size),
        },
    )


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> None:
    """Clear the saved profile so recommendations stop showing.

    The resume blob in MinIO is intentionally left behind — applications
    that referenced it still need their snapshot resolvable. A
    background sweep can reclaim orphans later.
    """
    profile = _load_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No profile to delete."
        )
    db.delete(profile)
    db.commit()
