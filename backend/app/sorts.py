"""Sort-mode enums used by listing endpoints.

Extracting these out of the routers means there's exactly one place to
add or rename a sort option. FastAPI auto-renders them as a string
enum in OpenAPI, so `/api/docs` lists the valid values for each query
parameter — and the frontend's typed API client picks them up via the
generated types (or via a manual mirror in `frontend/src/api/endpoints.ts`).
"""

import enum


class JobSort(str, enum.Enum):
    recent = "recent"
    salary_high = "salary_high"
    exp_low = "exp_low"


class ApplicantSort(str, enum.Enum):
    """Sort modes for HR's applicant listings (`/by-job/{id}` + `/all`)."""

    recent = "recent"
    expected_ctc = "expected_ctc"
    notice = "notice"
    experience = "experience"


class MyApplicationSort(str, enum.Enum):
    """Sort modes for a candidate's own application list (`/applications/mine`)."""

    recent = "recent"
    updated = "updated"
