"""CSV export of an HR's per-job applicants list.

Streams the body row-by-row through a generator so the response can scale
to thousands of applicants without materialising the whole file in memory
(the previous implementation built a `StringIO` and `iter([buf.getvalue()])`).
"""

import csv
import io
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.deps import DbSession, require_role
from app.models import Application, User, UserRole

from ._helpers import (
    ApplicantFilters,
    applicant_filter_params,
    apply_filters,
    get_hr_owned_job_or_403,
)

router = APIRouter()

# Columns shipped in the CSV. Identity fields (name, email, resume) are
# intentionally absent — matches the in-app anonymized cards.
CSV_COLUMNS: tuple[str, ...] = (
    "applicant_id",
    "experience_years",
    "skills",
    "current_ctc",
    "expected_ctc",
    "notice_period_days",
    "stage",
    "applied_date",
)


def _row_for(application: Application) -> list[object]:
    return [
        application.id,
        application.years_experience,
        "; ".join(application.skills),
        application.current_ctc,
        application.expected_ctc,
        application.notice_period_days,
        application.stage.value,
        application.created_at.date().isoformat(),
    ]


def _stream_csv(applications: list[Application]) -> Iterator[bytes]:
    """Yield UTF-8 CSV chunks (header + one row per application).

    The CSV writer wraps a small in-memory StringIO that we reset between
    rows; only one row's worth of bytes lives in the per-iteration buffer.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    yield buf.getvalue().encode("utf-8")
    buf.seek(0)
    buf.truncate(0)
    for app in applications:
        writer.writerow(_row_for(app))
        yield buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)


@router.get("/by-job/{job_id}/export")
def export_applicants_csv(
    job_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_role(UserRole.hr))],
    filters: Annotated[ApplicantFilters, Depends(applicant_filter_params)],
) -> StreamingResponse:
    """CSV download of the current filtered applicants list, no identity."""
    job = get_hr_owned_job_or_403(db, job_id, current_user)
    stmt = apply_filters(
        select(Application).where(Application.job_id == job_id), filters
    )
    apps = list(db.scalars(stmt).all())

    slug = job.title.lower().replace(" ", "-")
    filename = (
        f"candidates-{slug}-{datetime.now(timezone.utc).date().isoformat()}.csv"
    )
    return StreamingResponse(
        _stream_csv(apps),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
