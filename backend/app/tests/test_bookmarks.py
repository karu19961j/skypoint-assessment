from fastapi.testclient import TestClient

from app.tests.conftest import sample_job_payload


def _create_job(client: TestClient, hr_headers: dict) -> int:
    return client.post("/api/jobs/", json=sample_job_payload(), headers=hr_headers).json()["id"]


def test_bookmark_create_list_delete(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)

    created = client.post(
        "/api/bookmarks/", json={"job_id": job_id}, headers=candidate_headers
    )
    assert created.status_code == 201
    assert created.json()["job_id"] == job_id

    listed = client.get("/api/bookmarks/", headers=candidate_headers).json()
    assert [b["job_id"] for b in listed] == [job_id]

    client.delete(f"/api/bookmarks/{job_id}", headers=candidate_headers)
    assert client.get("/api/bookmarks/", headers=candidate_headers).json() == []


def test_bookmark_is_idempotent_returns_200_on_repeat(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)

    first = client.post(
        "/api/bookmarks/", json={"job_id": job_id}, headers=candidate_headers
    )
    assert first.status_code == 201

    second = client.post(
        "/api/bookmarks/", json={"job_id": job_id}, headers=candidate_headers
    )
    # No new row is created → 200 OK, not 201.
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]

    # Only one bookmark exists for the (candidate, job) pair.
    listed = client.get("/api/bookmarks/", headers=candidate_headers).json()
    assert len([b for b in listed if b["job_id"] == job_id]) == 1


def test_bookmarks_are_candidate_only(
    client: TestClient, hr_headers: dict
) -> None:
    resp = client.get("/api/bookmarks/", headers=hr_headers)
    assert resp.status_code == 403


def test_cannot_bookmark_inactive_job(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    job_id = _create_job(client, hr_headers)
    client.patch(
        f"/api/jobs/{job_id}/status", json={"status": "paused"}, headers=hr_headers
    )
    resp = client.post(
        "/api/bookmarks/", json={"job_id": job_id}, headers=candidate_headers
    )
    assert resp.status_code == 404
