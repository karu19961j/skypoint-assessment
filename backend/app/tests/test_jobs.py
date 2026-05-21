from fastapi.testclient import TestClient

from app.tests.conftest import (
    auth_headers,
    register_user,
    sample_job_payload,
)


def _create_job(client: TestClient, hr_headers: dict, **overrides) -> dict:
    resp = client.post("/api/jobs/", json=sample_job_payload(**overrides), headers=hr_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_hr_can_create_and_list_job(client: TestClient, hr_headers: dict) -> None:
    job = _create_job(client, hr_headers, title="Senior Python Engineer")
    assert job["title"] == "Senior Python Engineer"
    assert job["status"] == "active"

    resp = client.get("/api/jobs/", headers=hr_headers)
    assert resp.status_code == 200
    titles = [j["title"] for j in resp.json()]
    assert "Senior Python Engineer" in titles


def test_candidate_cannot_create_job(client: TestClient, candidate_headers: dict) -> None:
    resp = client.post(
        "/api/jobs/", json=sample_job_payload(), headers=candidate_headers
    )
    assert resp.status_code == 403


def test_candidate_only_sees_active_jobs(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    active = _create_job(client, hr_headers, title="Active Role")
    paused = _create_job(client, hr_headers, title="Paused Role")
    client.patch(
        f"/api/jobs/{paused['id']}/status",
        json={"status": "paused"},
        headers=hr_headers,
    )

    resp = client.get("/api/jobs/", headers=candidate_headers)
    assert resp.status_code == 200
    titles = [j["title"] for j in resp.json()]
    assert "Active Role" in titles
    assert "Paused Role" not in titles

    detail = client.get(f"/api/jobs/{paused['id']}", headers=candidate_headers)
    assert detail.status_code == 404

    # HR sees both.
    hr_list = client.get("/api/jobs/", headers=hr_headers)
    hr_titles = [j["title"] for j in hr_list.json()]
    assert "Active Role" in hr_titles
    assert "Paused Role" in hr_titles


def test_filters_q_and_skills(client: TestClient, hr_headers: dict, candidate_headers: dict) -> None:
    _create_job(
        client, hr_headers, title="React Frontend Engineer", skills=["react", "typescript"]
    )
    _create_job(
        client, hr_headers, title="Python Backend Engineer", skills=["python", "fastapi"]
    )

    by_q = client.get("/api/jobs/?q=react", headers=candidate_headers).json()
    assert {j["title"] for j in by_q} == {"React Frontend Engineer"}

    by_skill = client.get("/api/jobs/?skills=python", headers=candidate_headers).json()
    assert {j["title"] for j in by_skill} == {"Python Backend Engineer"}


def test_only_owner_can_update_or_delete_job(client: TestClient, hr_headers: dict) -> None:
    job = _create_job(client, hr_headers)

    other_hr_token = register_user(
        client, email="hr2@example.com", password="Pass1234!", role="hr", full_name="HR Two"
    )
    other_headers = auth_headers(other_hr_token)

    resp = client.patch(
        f"/api/jobs/{job['id']}", json={"title": "Hijacked"}, headers=other_headers
    )
    assert resp.status_code == 403

    resp = client.delete(f"/api/jobs/{job['id']}", headers=other_headers)
    assert resp.status_code == 403

    resp = client.delete(f"/api/jobs/{job['id']}", headers=hr_headers)
    assert resp.status_code == 204


def test_exp_range_validation(client: TestClient, hr_headers: dict) -> None:
    resp = client.post(
        "/api/jobs/",
        json=sample_job_payload(exp_min=5, exp_max=2),
        headers=hr_headers,
    )
    assert resp.status_code == 422
