"""Single source of truth for the score-breakdown shape.

Both HR-side `score_application_for_job` and candidate-side
`score_job_for_profile` emit the same five-component breakdown
(skills, experience, CTC, notice bonus, location bonus). Without a
shared base type we'd carry three drifting copies — one per direction
on the backend, plus another in the frontend's ScoreBadge component.
"""

from pydantic import BaseModel, Field


class BaseScoreOut(BaseModel):
    """Score components common to both ranking and recommendations.

    `notice` is meaningful only for HR ranking (it scores the candidate's
    notice period against an immediate-joiner bonus); recommendations
    always emit 0. `location` is meaningful only for recommendations
    (it rewards a candidate-preference / job-location match); ranking
    always emits 0. We keep both fields on the shared shape so the UI
    can render the same component with a single type contract.
    """

    total: int = Field(ge=0, le=100)
    skill: int = Field(ge=0)
    exp: int = Field(ge=0)
    ctc: int = Field(ge=0)
    notice: int = Field(ge=0, default=0)
    location: int = Field(ge=0, default=0)
    matched_skills: list[str] = Field(default_factory=list)
