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

# Point caps per scoring component. Lifted out of the function signatures
# so the single source of truth lives at module top — the README, the
# frontend ScoreBadge component, and the spec all reference these
# numbers.
SKILL_POINTS = 50
EXP_POINTS = 30
CTC_POINTS = 20
NOTICE_POINTS = 5    # HR ranking only (immediate-joiner bonus)
LOCATION_POINTS = 10  # Candidate recommendations only (preferred-location bonus)
TOTAL_CAP = 100  # Clamp the sum here so the badge fits in two digits.


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def normalize_skill(s: str) -> str:
    """Lowercase, trim, and collapse internal whitespace.

    `"React  Native"` (two spaces from a paste) and `"react native"`
    must compare equal — otherwise the candidate sees their match drop
    to zero for a typo nobody can see. The same normaliser runs in
    `frontend/src/components/TagInput.tsx`.
    """
    return " ".join(s.lower().split())


def _normalize_set(skills: list[str]) -> set[str]:
    return {normalize_skill(s) for s in skills if s and s.strip()}


def _skill_match_score(required: list[str], candidate: list[str], max_points: int = SKILL_POINTS) -> tuple[int, list[str]]:
    """Matched skills ÷ required skills × max_points (case-insensitive,
    whitespace-collapsed)."""
    if not required:
        # No required skills declared on the job → don't penalise candidates;
        # award full points to keep ranking dominated by exp/CTC fit.
        return max_points, []
    required_set = _normalize_set(required)
    candidate_set = _normalize_set(candidate)
    matched = sorted(required_set & candidate_set)
    score = round((len(matched) / len(required_set)) * max_points)
    return score, matched


def _experience_fit_score(
    candidate_years: int, job_min: int, job_max: int, max_points: int = EXP_POINTS
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
    expected: int, job_min: int, job_max: int, max_points: int = CTC_POINTS
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


# Notice-period bonus is a discrete bucket table — matches the HR filter
# dropdown (Immediate / 15 / 30 / 60 / 90 days) so the bonus value is
# intuitive when HR sees it next to the filter, and so a product tune is
# one row edit. Each entry is (inclusive_upper_days, points); anything
# past the last bucket scores 0 (a candidate with > 60 days notice is
# already filtered out of the "immediate joiner" win condition).
_NOTICE_BUCKETS: tuple[tuple[int, int], ...] = (
    (0, 5),    # immediate joiner — full bonus
    (15, 4),
    (30, 3),
    (60, 2),
)


def _notice_bonus_score(notice_days: int, max_points: int = NOTICE_POINTS) -> int:
    """Immediate joiner gets full bonus; bucket falls off to 0 past 90 days.

    All maths is integer — there's no float drift to round off, so the
    displayed badge value never shows `82.99` when the spec says 83.
    """
    notice_days = max(0, notice_days)
    for upper, points in _NOTICE_BUCKETS:
        if notice_days <= upper:
            return min(points, max_points)
    return 0


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
    total = min(TOTAL_CAP, skill + exp + ctc + notice)
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
    profile_preferred_locations: list[str],
) -> ScoreBreakdown:
    """Mirror of score_application_for_job, with a +10 location-match bonus.

    The bonus fires when the job's location_type appears in the candidate's
    set of preferred locations. An empty list means "no preference" and the
    bonus stays at zero (i.e. it never penalises, it only rewards a match).
    """
    skill, matched = _skill_match_score(job_required_skills, profile_skills)
    exp = _experience_fit_score(profile_years, job_exp_min, job_exp_max)
    ctc = _ctc_alignment_score(profile_expected_ctc, job_ctc_min, job_ctc_max)
    notice = 0  # candidate profile has no notice period; that's per-application
    # Normalise both sides through `normalize_skill()` so a free-text
    # "Remote" or "REMOTE" in profile_preferred_locations still matches
    # the enum's lowercase "remote" on job_location_type.
    normalized_pref = {normalize_skill(loc) for loc in profile_preferred_locations}
    location = (
        LOCATION_POINTS if normalize_skill(job_location_type) in normalized_pref else 0
    )
    total = min(TOTAL_CAP, skill + exp + ctc + notice + location)
    return ScoreBreakdown(
        total=total, skill=skill, exp=exp, ctc=ctc, notice=notice,
        location=location, matched_skills=matched,
    )
