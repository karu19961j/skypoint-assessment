from fastapi.testclient import TestClient

from app.tests.conftest import (
    sample_application_payload,
    sample_job_payload,
)


def test_dashboard_counts_reflect_state(
    client: TestClient, hr_headers: dict, candidate_headers: dict
) -> None:
    # Two active jobs + one paused
    job_a = client.post("/api/jobs/", json=sample_job_payload(title="A"), headers=hr_headers).json()
    job_b = client.post("/api/jobs/", json=sample_job_payload(title="B"), headers=hr_headers).json()
    job_c = client.post("/api/jobs/", json=sample_job_payload(title="C"), headers=hr_headers).json()
    client.patch(f"/api/jobs/{job_c['id']}/status", json={"status": "paused"}, headers=hr_headers)

    # One application on job A
    client.post(
        "/api/applications/",
        json=sample_application_payload(job_a["id"]),
        headers=candidate_headers,
    )

    dash = client.get("/api/dashboard/hr", headers=hr_headers)
    assert dash.status_code == 200
    body = dash.json()
    assert body["jobs"]["active"] == 2
    assert body["jobs"]["paused"] == 1
    assert body["applications"]["today"] == 1
    funnels = {f["job_id"]: f for f in body["funnels"]}
    assert funnels[job_a["id"]]["counts"]["applied"] == 1
    assert funnels[job_b["id"]]["total"] == 0


def test_candidate_cannot_view_dashboard(
    client: TestClient, candidate_headers: dict
) -> None:
    resp = client.get("/api/dashboard/hr", headers=candidate_headers)
    assert resp.status_code == 403
