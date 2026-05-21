from fastapi.testclient import TestClient

from app.tests.conftest import sample_job_payload


def test_profile_create_get_update_delete(
    client: TestClient, candidate_headers: dict
) -> None:
    # Initially null
    resp = client.get("/api/profile/", headers=candidate_headers)
    assert resp.status_code == 200
    assert resp.json() is None

    # Create via PUT
    resp = client.put(
        "/api/profile/",
        headers=candidate_headers,
        json={
            "skills": ["python", "fastapi"],
            "years_experience": 4,
            "expected_ctc": 2_000_000,
            "preferred_location": "remote",
        },
    )
    assert resp.status_code == 200
    saved = resp.json()
    assert saved["skills"] == ["python", "fastapi"]
    assert saved["years_experience"] == 4

    # Update via PUT (upsert path)
    resp = client.put(
        "/api/profile/",
        headers=candidate_headers,
        json={
            "skills": ["python", "fastapi", "postgres"],
            "years_experience": 5,
            "expected_ctc": 2_400_000,
            "preferred_location": "hybrid",
        },
    )
    assert resp.json()["years_experience"] == 5
    assert resp.json()["preferred_location"] == "hybrid"

    # GET shows the updated profile
    resp = client.get("/api/profile/", headers=candidate_headers)
    assert resp.json()["expected_ctc"] == 2_400_000

    # DELETE clears it
    resp = client.delete("/api/profile/", headers=candidate_headers)
    assert resp.status_code == 204
    resp = client.get("/api/profile/", headers=candidate_headers)
    assert resp.json() is None


def test_profile_is_candidate_only(
    client: TestClient, hr_headers: dict
) -> None:
    resp = client.get("/api/profile/", headers=hr_headers)
    assert resp.status_code == 403

    resp = client.put(
        "/api/profile/",
        headers=hr_headers,
        json={
            "skills": ["x"],
            "years_experience": 0,
            "expected_ctc": 0,
            "preferred_location": None,
        },
    )
    assert resp.status_code == 403


def test_recommendations_require_profile(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    # HR creates an active job so there's something to recommend
    client.post("/api/jobs/", json=sample_job_payload(), headers=hr_headers)

    # Without a profile, recommendations return 404 with helpful detail
    resp = client.get("/api/jobs/recommended", headers=candidate_headers)
    assert resp.status_code == 404
    assert "profile" in resp.json()["detail"].lower()

    # With a profile, recommendations come back scored + sorted
    client.put(
        "/api/profile/",
        headers=candidate_headers,
        json={
            "skills": ["python", "fastapi"],
            "years_experience": 3,
            "expected_ctc": 2_000_000,
            "preferred_location": "remote",
        },
    )
    resp = client.get("/api/jobs/recommended", headers=candidate_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    # Sorted by total desc
    totals = [r["score"]["total"] for r in rows]
    assert totals == sorted(totals, reverse=True)


def test_recommendations_are_candidate_only(
    client: TestClient, hr_headers: dict
) -> None:
    resp = client.get("/api/jobs/recommended", headers=hr_headers)
    assert resp.status_code == 403
