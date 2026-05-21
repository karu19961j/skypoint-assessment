from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession, require_role
from app.models import Bookmark, Job, JobStatus, User, UserRole
from app.schemas.bookmark import BookmarkCreate, BookmarkOut
from app.schemas.job import JobOut

router = APIRouter()


@router.get("/", response_model=list[BookmarkOut])
def list_bookmarks(
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> list[BookmarkOut]:
    rows = db.scalars(
        select(Bookmark)
        .where(Bookmark.candidate_id == current_user.id)
        .order_by(Bookmark.created_at.desc())
    ).all()
    return [
        BookmarkOut(
            id=b.id,
            job_id=b.job_id,
            candidate_id=b.candidate_id,
            created_at=b.created_at,
            job=JobOut.model_validate(b.job) if b.job else None,
        )
        for b in rows
    ]


@router.post("/", response_model=BookmarkOut, status_code=status.HTTP_201_CREATED)
def create_bookmark(
    payload: BookmarkCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> BookmarkOut:
    job = db.get(Job, payload.job_id)
    if job is None or job.status != JobStatus.active:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = db.scalar(
        select(Bookmark).where(
            Bookmark.candidate_id == current_user.id,
            Bookmark.job_id == payload.job_id,
        )
    )
    if existing is not None:
        return BookmarkOut(
            id=existing.id,
            job_id=existing.job_id,
            candidate_id=existing.candidate_id,
            created_at=existing.created_at,
            job=JobOut.model_validate(existing.job) if existing.job else None,
        )

    bookmark = Bookmark(candidate_id=current_user.id, job_id=payload.job_id)
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return BookmarkOut(
        id=bookmark.id,
        job_id=bookmark.job_id,
        candidate_id=bookmark.candidate_id,
        created_at=bookmark.created_at,
        job=JobOut.model_validate(bookmark.job) if bookmark.job else None,
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
) -> None:
    bookmark = db.scalar(
        select(Bookmark).where(
            Bookmark.candidate_id == current_user.id, Bookmark.job_id == job_id
        )
    )
    if bookmark is None:
        return
    db.delete(bookmark)
    db.commit()
