from fastapi.testclient import TestClient

from app.tests.conftest import sample_job_payload, seed_candidate_profile


def _minimal_payload(**overrides):
    """Minimal happy-path profile payload — exercises defaults for every
    field the new schema lets you omit. Tests that need specific values
    override per field."""
    payload = {
        "skills": ["python", "fastapi"],
        "is_fresher": False,
        "years_experience": 4,
        "current_ctc": 1_500_000,
        "expected_ctc": 2_400_000,
        "notice_period_days": 30,
        "preferred_locations": ["remote"],
        "experiences": [],
        "educations": [],
        "resume_key": None,
    }
    payload.update(overrides)
    return payload


def test_profile_create_get_update_delete(
    client: TestClient, candidate_headers: dict
) -> None:
    # Initially null
    resp = client.get("/api/profile/", headers=candidate_headers)
    assert resp.status_code == 200
    assert resp.json() is None

    # Create via PUT
    resp = client.put(
        "/api/profile/", headers=candidate_headers, json=_minimal_payload()
    )
    assert resp.status_code == 200
    saved = resp.json()
    assert saved["skills"] == ["python", "fastapi"]
    assert saved["years_experience"] == 4
    assert saved["current_ctc"] == 1_500_000
    assert saved["notice_period_days"] == 30
    assert saved["preferred_locations"] == ["remote"]
    assert saved["is_fresher"] is False
    assert saved["resume"] is None

    # Update via PUT (upsert path) — multi-select two locations
    resp = client.put(
        "/api/profile/",
        headers=candidate_headers,
        json=_minimal_payload(
            skills=["python", "fastapi", "postgres"],
            years_experience=5,
            expected_ctc=2_400_000,
            preferred_locations=["remote", "hybrid", "remote"],  # dup stripped
        ),
    )
    assert resp.json()["years_experience"] == 5
    assert resp.json()["preferred_locations"] == ["remote", "hybrid"]

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

    resp = client.put("/api/profile/", headers=hr_headers, json=_minimal_payload())
    assert resp.status_code == 403


# ---------- new fields ----------


def test_is_fresher_zeroes_work_experience_fields(
    client: TestClient, candidate_headers: dict
) -> None:
    """is_fresher=True is the authoritative flag — backend forces
    years_experience + current_ctc to 0 and drops experiences[] even if
    the form posts non-zero values. One source of truth."""
    payload = _minimal_payload(
        is_fresher=True,
        years_experience=5,  # ignored
        current_ctc=2_000_000,  # ignored
        experiences=[
            {
                "company": "Acme",
                "role": "Engineer",
                "from_date": "2022-01-01",
                "to_date": None,
                "is_current": True,
                "description": None,
            }
        ],
    )
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_fresher"] is True
    assert body["years_experience"] == 0
    assert body["current_ctc"] == 0
    assert body["experiences"] == []


def test_education_persists_and_returns(
    client: TestClient, candidate_headers: dict
) -> None:
    payload = _minimal_payload(
        educations=[
            {
                "institution": "IIT Bombay",
                "degree": "B.Tech",
                "field_of_study": "Computer Science",
                "from_year": 2016,
                "to_year": 2020,
            }
        ],
    )
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    edus = resp.json()["educations"]
    assert len(edus) == 1
    assert edus[0]["institution"] == "IIT Bombay"
    assert edus[0]["degree"] == "B.Tech"
    assert edus[0]["from_year"] == 2016
    assert edus[0]["to_year"] == 2020


def test_experience_with_is_current_drops_to_date(
    client: TestClient, candidate_headers: dict
) -> None:
    """If is_current=True, the backend strips to_date so the JSON
    snapshot is consistent — 'currently working here' + an end date is
    contradictory."""
    payload = _minimal_payload(
        experiences=[
            {
                "company": "Globex",
                "role": "Senior Engineer",
                "from_date": "2022-03-01",
                "to_date": "2024-01-01",  # should be ignored
                "is_current": True,
                "description": "Built APIs.",
            }
        ],
    )
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    exp = resp.json()["experiences"][0]
    assert exp["is_current"] is True
    assert exp["to_date"] is None


def test_experience_validates_date_order(
    client: TestClient, candidate_headers: dict
) -> None:
    """to_date before from_date is rejected at the Pydantic layer."""
    payload = _minimal_payload(
        experiences=[
            {
                "company": "Acme",
                "role": "Engineer",
                "from_date": "2023-01-01",
                "to_date": "2022-01-01",
                "is_current": False,
                "description": None,
            }
        ],
    )
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    assert resp.status_code == 422


def test_put_replaces_experiences_wholesale(
    client: TestClient, candidate_headers: dict
) -> None:
    """The PUT semantics are upsert-and-replace: each save submits the
    full state, so removing a row from the form removes it from the
    server too. No diff-and-patch."""
    first = client.put(
        "/api/profile/",
        headers=candidate_headers,
        json=_minimal_payload(
            experiences=[
                {
                    "company": "A",
                    "role": "Eng",
                    "from_date": "2020-01-01",
                    "to_date": "2021-01-01",
                    "is_current": False,
                    "description": None,
                },
                {
                    "company": "B",
                    "role": "Sr Eng",
                    "from_date": "2021-02-01",
                    "to_date": None,
                    "is_current": True,
                    "description": None,
                },
            ],
        ),
    ).json()
    assert len(first["experiences"]) == 2

    # Second PUT with one experience → first is dropped.
    second = client.put(
        "/api/profile/",
        headers=candidate_headers,
        json=_minimal_payload(
            experiences=[
                {
                    "company": "C",
                    "role": "Staff Eng",
                    "from_date": "2022-01-01",
                    "to_date": None,
                    "is_current": True,
                    "description": None,
                },
            ],
        ),
    ).json()
    assert len(second["experiences"]) == 1
    assert second["experiences"][0]["company"] == "C"


def test_resume_key_ownership_check(
    client: TestClient,
    candidate_headers: dict,
    in_memory_storage,
) -> None:
    """Resume key prefix is namespaced by user id — submitting another
    user's key gets a 403."""
    payload = _minimal_payload(resume_key="resumes/999999/somebody-elses.pdf")
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    assert resp.status_code == 403


# ---------- recommendations ----------


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
    seed_candidate_profile(client, candidate_headers, years_experience=3)
    resp = client.get("/api/jobs/recommended", headers=candidate_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    totals = [r["score"]["total"] for r in rows]
    assert totals == sorted(totals, reverse=True)


def test_recommendations_for_fresher_skip_senior_roles(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    """A fresher candidate (is_fresher=True, yoe=0) shouldn't see senior
    jobs in their recommendations — the pre-filter caps at exp_min<=2."""
    client.post(
        "/api/jobs/",
        json=sample_job_payload(
            title="Senior Engineer", exp_min=5, exp_max=10
        ),
        headers=hr_headers,
    )
    client.post(
        "/api/jobs/",
        json=sample_job_payload(
            title="Junior Engineer", exp_min=0, exp_max=2,
            ctc_min=400_000, ctc_max=800_000,
        ),
        headers=hr_headers,
    )

    seed_candidate_profile(
        client,
        candidate_headers,
        is_fresher=True,
        years_experience=0,
        current_ctc=0,
        expected_ctc=600_000,
        skills=["python"],
    )
    resp = client.get("/api/jobs/recommended", headers=candidate_headers)
    assert resp.status_code == 200
    titles = {r["title"] for r in resp.json()}
    assert "Junior Engineer" in titles
    assert "Senior Engineer" not in titles


def test_recommendations_paycut_filter(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    """Non-fresher candidates don't see jobs whose ceiling is < 80% of
    their current CTC — those would be a substantial paycut."""
    client.post(
        "/api/jobs/",
        json=sample_job_payload(
            title="Reasonable", exp_min=2, exp_max=6,
            ctc_min=2_000_000, ctc_max=2_500_000,
        ),
        headers=hr_headers,
    )
    client.post(
        "/api/jobs/",
        json=sample_job_payload(
            title="Way Below",
            exp_min=2, exp_max=6,
            ctc_min=500_000, ctc_max=900_000,  # < 80% of 2M
        ),
        headers=hr_headers,
    )

    seed_candidate_profile(
        client,
        candidate_headers,
        years_experience=4,
        current_ctc=2_000_000,
        expected_ctc=2_500_000,
    )
    resp = client.get("/api/jobs/recommended", headers=candidate_headers)
    titles = {r["title"] for r in resp.json()}
    assert "Reasonable" in titles
    assert "Way Below" not in titles


def test_recommendations_are_candidate_only(
    client: TestClient, hr_headers: dict
) -> None:
    resp = client.get("/api/jobs/recommended", headers=hr_headers)
    assert resp.status_code == 403
