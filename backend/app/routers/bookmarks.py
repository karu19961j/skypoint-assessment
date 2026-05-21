from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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


def _bookmark_out(bookmark: Bookmark) -> BookmarkOut:
    return BookmarkOut(
        id=bookmark.id,
        job_id=bookmark.job_id,
        candidate_id=bookmark.candidate_id,
        created_at=bookmark.created_at,
        job=JobOut.model_validate(bookmark.job) if bookmark.job else None,
    )


@router.post("/", response_model=BookmarkOut, status_code=status.HTTP_201_CREATED)
def create_bookmark(
    payload: BookmarkCreate,
    response: Response,
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
        # Idempotent: same bookmark, no DB write. Reflect that as 200 OK.
        response.status_code = status.HTTP_200_OK
        return _bookmark_out(existing)

    bookmark = Bookmark(candidate_id=current_user.id, job_id=payload.job_id)
    db.add(bookmark)
    try:
        db.commit()
    except IntegrityError:
        # Race: another concurrent POST inserted the same (candidate_id, job_id).
        # The unique constraint is authoritative; return the existing row.
        db.rollback()
        existing = db.scalar(
            select(Bookmark).where(
                Bookmark.candidate_id == current_user.id,
                Bookmark.job_id == payload.job_id,
            )
        )
        if existing is None:  # pragma: no cover — defensive, should not happen
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Could not save bookmark."
            ) from None
        response.status_code = status.HTTP_200_OK
        return _bookmark_out(existing)
    db.refresh(bookmark)
    return _bookmark_out(bookmark)


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
