from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.job import JobOut


class BookmarkCreate(BaseModel):
    job_id: int


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    candidate_id: int
    created_at: datetime
    job: JobOut | None = None
