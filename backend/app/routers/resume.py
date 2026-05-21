"""Resume upload + download endpoints.

Single-origin design: the browser only ever talks to `/api/*` through the
nginx proxy. Both upload and download go through FastAPI, which talks to
MinIO over the docker network. We don't expose MinIO to the host — that
keeps the surface tight and means a future swap to AWS S3 doesn't need
the browser CORS / endpoint to change.

Two endpoints:

  POST /api/resume/upload
      Multipart file upload from the candidate. Validates extension +
      size, persists the bytes to MinIO under `resumes/{user_id}/{uuid}`,
      and returns the storage key. The candidate then submits the key
      on their profile (PUT /api/profile) — applying to a job snapshots
      the profile's resume into the application row, no per-application
      upload step.

  GET /api/resume/{application_id}/download
      Owner-checked stream (candidate who owns the app, or HR who owns
      the job). Returns the file inline with the original filename in
      Content-Disposition. Backend streams from MinIO so we never buffer
      the full body in RAM.
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.deps import DbSession, require_role
from app.models import User, UserRole
from app.routers.applications._helpers import (
    ensure_can_view_application,
    get_application_or_404,
)
from app.schemas.application import ResumeUploadOut
from app.services.resume_text import (
    SUPPORTED_CONTENT_TYPES,
    SUPPORTED_EXTENSIONS,
    extension_for,
)
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/upload",
    response_model=ResumeUploadOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_resume(
    db: DbSession,  # noqa: ARG001 - kept for future per-upload DB writes
    current_user: Annotated[User, Depends(require_role(UserRole.candidate))],
    file: UploadFile = File(..., description="PDF, DOC, or DOCX resume (max 15 MB)."),
) -> ResumeUploadOut:
    """Upload a resume binary to object storage; return the key.

    The candidate then submits this key via `PUT /api/profile` to attach
    it to their profile. Applications snapshot the profile's resume at
    apply time — there's no per-application resume upload.
    """
    settings = get_settings()
    max_bytes = settings.resume_max_bytes

    # ----- validate extension + content-type -----
    original_name = file.filename or "resume"
    ext = extension_for(original_name)
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Resume must be one of: {', '.join(sorted(SUPPORTED_EXTENSIONS))}.",
        )
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in SUPPORTED_CONTENT_TYPES:
        # Browsers occasionally send odd content-types ("application/octet-stream")
        # for valid PDFs/DOCXs. Don't reject if the extension passed — the
        # filename gate is the authoritative one.
        logger.info(
            "Accepting resume with unexpected content-type %r (extension %r)",
            content_type,
            ext,
        )

    # ----- read body with the size cap as a guard -----
    body = await file.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Resume exceeds the {max_bytes // (1024 * 1024)} MB limit.",
        )
    if not body:
        raise HTTPException(status_code=400, detail="Empty resume file.")

    # ----- store in MinIO -----
    key = f"resumes/{current_user.id}/{uuid.uuid4().hex}{ext}"
    storage = get_storage()
    storage.put_object(
        key=key,
        body=body,
        content_type=content_type or "application/octet-stream",
        filename=original_name,
    )

    return ResumeUploadOut(
        resume_key=key,
        filename=original_name,
        size_bytes=len(body),
        content_type=content_type or "application/octet-stream",
    )


@router.get("/{application_id}/download")
def download_resume(
    application_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.candidate, UserRole.hr))],
) -> StreamingResponse:
    """Stream the resume back, owner-checked.

    Returns 404 when the application has no resume on file (e.g. seed
    rows) so callers can render a friendly empty state.
    """
    application = get_application_or_404(db, application_id)
    ensure_can_view_application(application, current_user)

    if not application.resume_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume on file for this application.",
        )

    storage = get_storage()
    stored = storage.head_object(application.resume_key)
    if stored is None:
        # DB row references an object that's gone — log loudly, return
        # 404 so the UI shows the same empty state as "no resume".
        logger.error(
            "Resume key %r referenced by application %s is missing from storage.",
            application.resume_key,
            application.id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file is no longer available.",
        )

    filename = stored.filename or application.resume_filename or "resume"
    return StreamingResponse(
        storage.iter_object(application.resume_key),
        media_type=stored.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(stored.size),
        },
    )
