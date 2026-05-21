"""Candidate ranking / job recommendation scoring.

The scoring is a pure function of (application, job) and (candidate_profile,
job) — no external API, no LLM. The output is a 0–100 fit score plus a
breakdown so the UI can show "Skills 40/50 · Exp 25/30 · CTC 19/20 · Notice 4/5"
in a tooltip.

Why pure logic, not an LLM:

- Deterministic — recruiters can reason about why a score moved.
- No external dependency, no API key, no rate limit, no latency tail.
- Fast enough to compute per-request at assessment scale.

The same scoring engine drives both directions:

- HR-side `score_application_for_job(application, job)` ranks candidates
  for a posting.
- Candidate-side `score_job_for_profile(job, profile)` scores active jobs
  against a candidate's stored profile (adds a +10 location-match bonus).
"""

from dataclasses import dataclass


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _skill_match_score(required: list[str], candidate: list[str], max_points: int = 50) -> tuple[int, list[str]]:
    """Matched skills ÷ required skills × max_points (case-insensitive)."""
    if not required:
        # No required skills declared on the job → don't penalise candidates;
        # award full points to keep ranking dominated by exp/CTC fit.
        return max_points, []
    required_set = {s.lower().strip() for s in required if s and s.strip()}
    candidate_set = {s.lower().strip() for s in candidate if s and s.strip()}
    matched = sorted(required_set & candidate_set)
    score = round((len(matched) / len(required_set)) * max_points)
    return score, matched


def _experience_fit_score(
    candidate_years: int, job_min: int, job_max: int, max_points: int = 30
) -> int:
    """Full points if within the job's exp range, scaled if outside.

    Above the band decays slowly (cap ÷ 5y), below the band decays faster
    (cap ÷ 3y) — a junior candidate is a worse fit than an over-qualified
    one for the same posting.
    """
    if job_min <= candidate_years <= job_max:
        return max_points
    if candidate_years > job_max:
        gap = candidate_years - job_max
        return round(max_points * _clamp(1 - gap / 5))
    gap = job_min - candidate_years
    return round(max_points * _clamp(1 - gap / 3))


def _ctc_alignment_score(
    expected: int, job_min: int, job_max: int, max_points: int = 20
) -> int:
    """Full points if expected CTC falls inside the job's salary range,
    scaled down linearly as expected exceeds job_max."""
    if expected <= 0 or job_max <= 0:
        return max_points
    if expected <= job_max and expected >= job_min:
        return max_points
    if expected < job_min:
        # Asking less than the job's floor still aligns — give full points.
        return max_points
    over = expected - job_max
    return round(max_points * _clamp(1 - over / max(job_max, 1)))


def _notice_bonus_score(notice_days: int, max_points: int = 5) -> int:
    """Immediate joiner = full bonus; linearly fades to zero at 90 days+."""
    notice_days = max(0, notice_days)
    return round(max_points * _clamp(1 - notice_days / 90))


@dataclass(frozen=True)
class ScoreBreakdown:
    total: int
    skill: int
    exp: int
    ctc: int
    notice: int
    location: int  # only meaningful for recommendations; 0 for candidate ranking
    matched_skills: list[str]


def score_application_for_job(
    *,
    required_skills: list[str],
    candidate_skills: list[str],
    job_exp_min: int,
    job_exp_max: int,
    job_ctc_min: int,
    job_ctc_max: int,
    candidate_years: int,
    candidate_expected_ctc: int,
    candidate_notice_days: int,
) -> ScoreBreakdown:
    skill, matched = _skill_match_score(required_skills, candidate_skills)
    exp = _experience_fit_score(candidate_years, job_exp_min, job_exp_max)
    ctc = _ctc_alignment_score(candidate_expected_ctc, job_ctc_min, job_ctc_max)
    notice = _notice_bonus_score(candidate_notice_days)
    total = min(100, skill + exp + ctc + notice)
    return ScoreBreakdown(
        total=total, skill=skill, exp=exp, ctc=ctc, notice=notice,
        location=0, matched_skills=matched,
    )


def score_job_for_profile(
    *,
    job_required_skills: list[str],
    job_exp_min: int,
    job_exp_max: int,
    job_ctc_min: int,
    job_ctc_max: int,
    job_location_type: str,
    profile_skills: list[str],
    profile_years: int,
    profile_expected_ctc: int,
    profile_preferred_location: str | None,
) -> ScoreBreakdown:
    """Mirror of score_application_for_job, with a +10 location-match bonus."""
    skill, matched = _skill_match_score(job_required_skills, profile_skills)
    exp = _experience_fit_score(profile_years, job_exp_min, job_exp_max)
    ctc = _ctc_alignment_score(profile_expected_ctc, job_ctc_min, job_ctc_max)
    notice = 0  # candidate profile has no notice period; that's per-application
    location = 10 if (profile_preferred_location and profile_preferred_location == job_location_type) else 0
    total = min(100, skill + exp + ctc + notice + location)
    return ScoreBreakdown(
        total=total, skill=skill, exp=exp, ctc=ctc, notice=notice,
        location=location, matched_skills=matched,
    )
