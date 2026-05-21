"""Pure-logic tests for the scoring engine + endpoint integration tests."""

from fastapi.testclient import TestClient

from app.services.ranking import score_application_for_job, score_job_for_profile
from app.tests.conftest import (
    auth_headers,
    register_user,
    sample_application_payload,
    sample_job_payload,
)


# ---------- Pure scoring logic ----------


def test_score_perfect_match_caps_at_100():
    score = score_application_for_job(
        required_skills=["python", "fastapi", "postgres"],
        candidate_skills=["python", "fastapi", "postgres"],
        job_exp_min=3,
        job_exp_max=7,
        job_ctc_min=1_500_000,
        job_ctc_max=2_500_000,
        candidate_years=5,
        candidate_expected_ctc=2_000_000,
        candidate_notice_days=0,
    )
    assert score.skill == 50
    assert score.exp == 30
    assert score.ctc == 20
    assert score.notice == 5
    # Raw sum is 105, clamped to 100.
    assert score.total == 100
    assert score.matched_skills == ["fastapi", "postgres", "python"]


def test_score_partial_skill_match():
    score = score_application_for_job(
        required_skills=["python", "fastapi", "postgres", "kafka"],
        candidate_skills=["python", "django"],
        job_exp_min=3,
        job_exp_max=7,
        job_ctc_min=1_500_000,
        job_ctc_max=2_500_000,
        candidate_years=5,
        candidate_expected_ctc=2_000_000,
        candidate_notice_days=30,
    )
    # 1 of 4 required skills → 0.25 * 50 = 12.5 → 12 (banker's rounding in Py3)
    assert score.skill == 12
    assert score.matched_skills == ["python"]
    # 30 days notice → 5 * (1 - 30/90) = 5 * 0.6667 ≈ 3
    assert score.notice == 3


def test_score_overqualified_loses_points_slowly():
    score = score_application_for_job(
        required_skills=["python"],
        candidate_skills=["python"],
        job_exp_min=2,
        job_exp_max=4,
        job_ctc_min=1_000_000,
        job_ctc_max=2_000_000,
        candidate_years=9,  # 5 years over the cap
        candidate_expected_ctc=2_500_000,  # 25% over the cap
        candidate_notice_days=90,  # 0 notice bonus
    )
    # Exp: 30 * (1 - 5/5) = 0
    assert score.exp == 0
    # CTC: 20 * (1 - 500_000/2_000_000) = 15
    assert score.ctc == 15
    assert score.notice == 0


def test_recommendation_score_adds_location_bonus_for_match():
    matched = score_job_for_profile(
        job_required_skills=["python"],
        job_exp_min=0,
        job_exp_max=10,
        job_ctc_min=0,
        job_ctc_max=5_000_000,
        job_location_type="remote",
        profile_skills=["python"],
        profile_years=5,
        profile_expected_ctc=2_000_000,
        profile_preferred_locations=["remote", "hybrid"],
    )
    assert matched.location == 10
    assert matched.total == min(100, matched.skill + matched.exp + matched.ctc + matched.location)


def test_recommendation_score_no_location_bonus_when_mismatched():
    mismatched = score_job_for_profile(
        job_required_skills=["python"],
        job_exp_min=0,
        job_exp_max=10,
        job_ctc_min=0,
        job_ctc_max=5_000_000,
        job_location_type="onsite",
        profile_skills=["python"],
        profile_years=5,
        profile_expected_ctc=2_000_000,
        profile_preferred_locations=["remote"],
    )
    assert mismatched.location == 0


def test_recommendation_score_no_bonus_when_no_preferences():
    """Empty preferred_locations list means 'no preference' — the bonus
    is zero but it never penalises."""
    no_pref = score_job_for_profile(
        job_required_skills=["python"],
        job_exp_min=0,
        job_exp_max=10,
        job_ctc_min=0,
        job_ctc_max=5_000_000,
        job_location_type="remote",
        profile_skills=["python"],
        profile_years=5,
        profile_expected_ctc=2_000_000,
        profile_preferred_locations=[],
    )
    assert no_pref.location == 0


# ---------- Endpoint integration ----------


def _create_job(client: TestClient, hr_headers: dict) -> int:
    return client.post(
        "/api/jobs/",
        json=sample_job_payload(skills=["python", "fastapi"]),
        headers=hr_headers,
    ).json()["id"]


def test_ranked_endpoint_returns_sorted_by_score(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    # Strong candidate with both skills
    client.post(
        "/api/applications/",
        json=sample_application_payload(
            job_id,
            skills=["python", "fastapi"],
            years_experience=5,
            expected_ctc=2_000_000,
            notice_period_days=0,
        ),
        headers=candidate_headers,
    )

    # Weaker candidate, different account
    other = register_user(
        client, email="weaker@example.com", password="Pass1234!", role="candidate", full_name="W"
    )
    client.post(
        "/api/applications/",
        json=sample_application_payload(
            job_id,
            skills=["django"],
            years_experience=0,
            expected_ctc=4_000_000,
            notice_period_days=90,
        ),
        headers=auth_headers(other),
    )

    resp = client.get(
        f"/api/applications/by-job/{job_id}/ranked", headers=hr_headers
    )
    assert resp.status_code == 200
    ranked = resp.json()
    assert len(ranked) == 2
    # Sorted by total desc
    assert ranked[0]["score"]["total"] >= ranked[1]["score"]["total"]
    # Strong candidate's matched_skills are the intersection of required and provided
    strong = ranked[0]
    assert set(strong["score"]["matched_skills"]) == {"python", "fastapi"}


def test_ranked_endpoint_is_owner_only(
    client: TestClient, hr_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    other_hr = register_user(
        client, email="hr-other@example.com", password="Pass1234!", role="hr", full_name="H"
    )
    resp = client.get(
        f"/api/applications/by-job/{job_id}/ranked",
        headers=auth_headers(other_hr),
    )
    assert resp.status_code == 403


# ---------- CSV export ----------


def test_csv_export_returns_anonymized_rows(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )

    resp = client.get(
        f"/api/applications/by-job/{job_id}/export", headers=hr_headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    body = resp.text
    # Header
    assert body.startswith(
        "applicant_id,experience_years,skills,current_ctc,expected_ctc,notice_period_days,stage,applied_date"
    )
    # No name or email leaked
    assert "candidate@example.com" not in body
    assert "Candidate User" not in body


def test_csv_export_requires_ownership(
    client: TestClient, hr_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    other_hr = register_user(
        client, email="hr-stranger@example.com", password="Pass1234!", role="hr", full_name="X"
    )
    resp = client.get(
        f"/api/applications/by-job/{job_id}/export",
        headers=auth_headers(other_hr),
    )
    assert resp.status_code == 403
