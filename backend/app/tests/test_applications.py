import pytest
from fastapi.testclient import TestClient

from app.tests.conftest import (
    auth_headers,
    register_user,
    sample_application_payload,
    sample_job_payload,
    seed_candidate_profile,
)


@pytest.fixture(autouse=True)
def _candidate_ready_to_apply(client, candidate_headers, in_memory_storage):
    """Apply now requires a profile + resume on file. This autouse
    fixture provisions both for the candidate so the existing test bodies
    can keep calling POST /api/applications without extra ceremony.
    HR-only tests (test_hr_cannot_apply) still get 403 because the role
    check fires before the profile check."""
    upload = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("cv.pdf", b"%PDF-1.4\ntest content", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    seed_candidate_profile(
        client, candidate_headers, resume_key=upload.json()["resume_key"]
    )


def _create_job(client: TestClient, hr_headers: dict) -> int:
    resp = client.post("/api/jobs/", json=sample_job_payload(), headers=hr_headers)
    return resp.json()["id"]


def test_candidate_can_apply_and_list_own(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)

    apply = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )
    assert apply.status_code == 201
    assert apply.json()["stage"] == "applied"

    mine = client.get("/api/applications/mine", headers=candidate_headers).json()
    assert len(mine) == 1
    assert mine[0]["job"]["id"] == job_id


def test_duplicate_application_rejected(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    first = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )
    assert first.status_code == 201
    dup = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )
    assert dup.status_code == 409


def test_hr_cannot_apply(client: TestClient, hr_headers: dict) -> None:
    job_id = _create_job(client, hr_headers)
    resp = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=hr_headers,
    )
    assert resp.status_code == 403


def test_withdraw_only_at_applied_stage(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    # Move to screening as HR
    moved = client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "screening"},
        headers=hr_headers,
    )
    assert moved.status_code == 200
    assert moved.json()["stage"] == "screening"

    # Candidate cannot withdraw past Applied
    withdraw = client.delete(
        f"/api/applications/{app['id']}", headers=candidate_headers
    )
    assert withdraw.status_code == 400

    # Move back to applied; withdraw allowed
    client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "applied"},
        headers=hr_headers,
    )
    withdraw = client.delete(
        f"/api/applications/{app['id']}", headers=candidate_headers
    )
    assert withdraw.status_code == 204


def test_cannot_apply_to_inactive_job(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    client.patch(
        f"/api/jobs/{job_id}/status", json={"status": "paused"}, headers=hr_headers
    )
    resp = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )
    assert resp.status_code == 400


def test_cannot_apply_after_deadline(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    from datetime import date, timedelta

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    resp = client.post(
        "/api/jobs/",
        json=sample_job_payload(deadline=yesterday),
        headers=hr_headers,
    )
    job_id = resp.json()["id"]

    resp = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    )
    assert resp.status_code == 400
    assert "deadline" in resp.json()["detail"].lower()


def test_disallowed_stage_skip_rejected(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    """The transitions map blocks skipping straight from Applied to Offer —
    the frontend's filtered dropdown would never offer it, but a curl
    caller hits the backend guard with a clear error message."""
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    resp = client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "offer"},
        headers=hr_headers,
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "applied" in detail and "offer" in detail
    # The error tells the caller what IS allowed (Applied → Screening or Rejected).
    assert "screening" in detail


def test_application_detail_lists_allowed_next_stages(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()
    resp = client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "screening"},
        headers=hr_headers,
    )
    body = resp.json()
    # Screening can step back to Applied, forward to Interview, or Rejected.
    assert set(body["allowed_next_stages"]) == {"applied", "interview", "rejected"}


def test_cannot_transition_out_of_terminal_stage(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    # Move through to "hired".
    for stage in ("screening", "interview", "offer", "hired"):
        resp = client.patch(
            f"/api/applications/{app['id']}/stage",
            json={"stage": stage},
            headers=hr_headers,
        )
        assert resp.status_code == 200

    # Trying to walk it back out of a terminal stage is rejected.
    resp = client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "interview"},
        headers=hr_headers,
    )
    assert resp.status_code == 400
    assert "terminal" in resp.json()["detail"].lower()


def test_hr_can_only_see_own_jobs_applicants(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    my_job = _create_job(client, hr_headers)
    client.post(
        "/api/applications/",
        json=sample_application_payload(my_job),
        headers=candidate_headers,
    )

    other_token = register_user(
        client, email="hr2@example.com", password="Pass1234!", role="hr", full_name="HR Two"
    )
    other_headers = auth_headers(other_token)

    resp = client.get(f"/api/applications/by-job/{my_job}", headers=other_headers)
    assert resp.status_code == 403

    resp = client.get(f"/api/applications/by-job/{my_job}", headers=hr_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_hr_cannot_stage_move_another_hrs_application(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    my_job = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(my_job),
        headers=candidate_headers,
    ).json()

    other_hr = register_user(
        client, email="hr-x@example.com", password="Pass1234!", role="hr", full_name="HR X"
    )

    resp = client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "screening"},
        headers=auth_headers(other_hr),
    )
    assert resp.status_code == 403
    # Sanity: stage didn't actually move
    check = client.get("/api/applications/mine", headers=candidate_headers).json()
    assert check[0]["stage"] == "applied"


def test_all_endpoint_scopes_to_requesting_hrs_jobs(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    # HR #1 has a job + an application
    my_job = _create_job(client, hr_headers)
    client.post(
        "/api/applications/",
        json=sample_application_payload(my_job),
        headers=candidate_headers,
    )

    # HR #2 has their own job + their own (different) application from a 2nd candidate
    other_hr = register_user(
        client, email="hr-y@example.com", password="Pass1234!", role="hr", full_name="HR Y"
    )
    other_hr_headers = auth_headers(other_hr)
    other_job = _create_job(client, other_hr_headers)
    other_cand = register_user(
        client,
        email="cand-2@example.com",
        password="Pass1234!",
        role="candidate",
        full_name="C2",
    )
    client.post(
        "/api/applications/",
        json=sample_application_payload(other_job),
        headers=auth_headers(other_cand),
    )

    # HR #1's feed: only the 1 application on their job
    mine = client.get("/api/applications/all", headers=hr_headers).json()
    assert {a["job_id"] for a in mine} == {my_job}
    assert len(mine) == 1

    # HR #2's feed: only their own
    theirs = client.get("/api/applications/all", headers=other_hr_headers).json()
    assert {a["job_id"] for a in theirs} == {other_job}

    # Scoping to another HR's job_id is rejected
    resp = client.get(
        f"/api/applications/all?job_id={other_job}", headers=hr_headers
    )
    assert resp.status_code == 403


def test_all_endpoint_is_hr_only(client: TestClient, candidate_headers: dict) -> None:
    resp = client.get("/api/applications/all", headers=candidate_headers)
    assert resp.status_code == 403


def test_timeline_records_stage_transitions(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    # First event is the initial apply.
    timeline = client.get(
        f"/api/applications/{app['id']}/timeline", headers=candidate_headers
    ).json()
    assert len(timeline) == 1
    assert timeline[0]["from_stage"] is None
    assert timeline[0]["to_stage"] == "applied"

    # HR moves the application; timeline gains a second event.
    client.patch(
        f"/api/applications/{app['id']}/stage",
        json={"stage": "screening"},
        headers=hr_headers,
    )
    timeline = client.get(
        f"/api/applications/{app['id']}/timeline", headers=candidate_headers
    ).json()
    assert [(e["from_stage"], e["to_stage"]) for e in timeline] == [
        (None, "applied"),
        ("applied", "screening"),
    ]


def test_timeline_visible_only_to_owners(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    other_candidate_token = register_user(
        client,
        email="other.cand@example.com",
        password="Pass1234!",
        role="candidate",
        full_name="Other Candidate",
    )
    other_hr_token = register_user(
        client, email="hr2@example.com", password="Pass1234!", role="hr", full_name="HR Two"
    )

    # Stranger candidate gets 403.
    resp = client.get(
        f"/api/applications/{app['id']}/timeline",
        headers=auth_headers(other_candidate_token),
    )
    assert resp.status_code == 403

    # Stranger HR gets 403.
    resp = client.get(
        f"/api/applications/{app['id']}/timeline",
        headers=auth_headers(other_hr_token),
    )
    assert resp.status_code == 403

    # Owning HR sees it.
    resp = client.get(
        f"/api/applications/{app['id']}/timeline", headers=hr_headers
    )
    assert resp.status_code == 200


def test_notes_are_hr_only(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    app = client.post(
        "/api/applications/",
        json=sample_application_payload(job_id),
        headers=candidate_headers,
    ).json()

    forbidden = client.post(
        f"/api/applications/{app['id']}/notes",
        json={"body": "secret"},
        headers=candidate_headers,
    )
    assert forbidden.status_code == 403

    allowed = client.post(
        f"/api/applications/{app['id']}/notes",
        json={"body": "Strong communicator."},
        headers=hr_headers,
    )
    assert allowed.status_code == 201

    listed = client.get(
        f"/api/applications/{app['id']}/notes", headers=hr_headers
    ).json()
    assert len(listed) == 1
    assert listed[0]["body"] == "Strong communicator."

    # Candidate cannot list notes either
    blocked = client.get(
        f"/api/applications/{app['id']}/notes", headers=candidate_headers
    )
    assert blocked.status_code == 403
