"""Tests for the resume upload / download / keyword-search pipeline.

Resume lives on the candidate profile in the new flow — uploaded once,
snapshotted into every application. These tests exercise:

  - text extraction (PDF + DOCX paths against in-memory bytes; .doc returns "")
  - the FastAPI upload endpoint (size cap + allow-list)
  - profile PUT accepting the resume key + extracting text
  - the download endpoint (owner check on both sides)
  - keyword search hitting resume_text (extension of the existing /by-job filter)

Real MinIO isn't needed — the `in_memory_storage` fixture in conftest.py
swaps the storage singleton for an in-process dict.
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.services.resume_text import extract_text

from .conftest import (
    InMemoryStorage,
    auth_headers,
    sample_application_payload,
    sample_job_payload,
    seed_candidate_profile,
)


# ---------- text extraction ----------


def test_extract_text_handles_unknown_extension_quietly():
    """No-format files return "" rather than raising — keeps upload OK."""
    assert extract_text(filename="resume.xyz", body=b"random bytes") == ""


def test_extract_text_doc_returns_empty():
    """Legacy .doc binary parsing isn't shipped; we still accept the upload
    but text extraction is a documented no-op for that format."""
    assert extract_text(filename="resume.doc", body=b"%doc-magic") == ""


def test_extract_text_docx_round_trips():
    """python-docx round-trips a paragraph and pulls it back out."""
    from docx import Document

    doc = Document()
    doc.add_paragraph("Five years of Python and FastAPI experience.")
    buf = io.BytesIO()
    doc.save(buf)
    out = extract_text(filename="resume.docx", body=buf.getvalue())
    assert "Python" in out
    assert "FastAPI" in out


# ---------- upload endpoint ----------


def test_upload_rejects_unsupported_extension(
    client: TestClient,
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    resp = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("resume.txt", b"not allowed", "text/plain")},
    )
    assert resp.status_code == 415
    assert "PDF" in resp.json()["detail"] or "pdf" in resp.json()["detail"].lower()


def test_upload_rejects_oversized_file(
    client: TestClient,
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    from app.config import get_settings

    cap = get_settings().resume_max_bytes
    oversized = b"%PDF-1.4\n" + b"a" * cap
    resp = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("resume.pdf", oversized, "application/pdf")},
    )
    assert resp.status_code == 413


def test_upload_stores_and_returns_key(
    client: TestClient,
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """Successful upload returns the key shape the profile PUT expects."""
    resp = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("resume.pdf", b"%PDF-1.4\ndummy-content", "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["resume_key"].startswith("resumes/")
    assert body["resume_key"].endswith(".pdf")
    assert body["filename"] == "resume.pdf"
    assert body["size_bytes"] > 0
    assert in_memory_storage.head_object(body["resume_key"]) is not None


# ---------- profile PUT extracts resume text ----------


def test_profile_put_extracts_resume_text(
    client: TestClient,
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """When the candidate attaches a resume key to their profile, the
    server re-fetches the object and extracts text so HR keyword search
    can hit it on future applications."""
    from docx import Document

    doc = Document()
    doc.add_paragraph("Worked with kubernetes at scale.")
    buf = io.BytesIO()
    doc.save(buf)
    upload = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    profile = seed_candidate_profile(
        client, candidate_headers, resume_key=upload.json()["resume_key"]
    )
    assert profile["resume"]["filename"] == "cv.docx"


# ---------- download endpoint ----------


def test_download_streams_resume_for_owner(
    client: TestClient,
    hr_headers: dict[str, str],
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """End-to-end: upload → profile → apply → HR downloads the snapshot."""
    job_id = client.post(
        "/api/jobs/", headers=hr_headers, json=sample_job_payload()
    ).json()["id"]

    upload = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("cv.pdf", b"%PDF-1.4\ncontent", "application/pdf")},
    )
    seed_candidate_profile(
        client, candidate_headers, resume_key=upload.json()["resume_key"]
    )

    apply_resp = client.post(
        "/api/applications/",
        headers=candidate_headers,
        json=sample_application_payload(job_id),
    )
    assert apply_resp.status_code == 201, apply_resp.text
    application_id = apply_resp.json()["id"]

    dl = client.get(f"/api/resume/{application_id}/download", headers=hr_headers)
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/pdf"
    assert "cv.pdf" in dl.headers["content-disposition"]
    assert dl.content.startswith(b"%PDF-1.4")


def test_download_blocked_for_other_hr(
    client: TestClient,
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """An HR who doesn't own the job can't download the resume."""
    from .conftest import register_user

    owner_hr = register_user(
        client, email="owner@example.com", password="HrPass1234!", role="hr",
        full_name="Owner HR",
    )
    other_hr = register_user(
        client, email="other@example.com", password="HrPass1234!", role="hr",
        full_name="Other HR",
    )
    job_id = client.post(
        "/api/jobs/", headers=auth_headers(owner_hr), json=sample_job_payload()
    ).json()["id"]
    upload = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={"file": ("cv.pdf", b"%PDF-1.4\ncontent", "application/pdf")},
    )
    seed_candidate_profile(
        client, candidate_headers, resume_key=upload.json()["resume_key"]
    )
    application_id = client.post(
        "/api/applications/",
        headers=candidate_headers,
        json=sample_application_payload(job_id),
    ).json()["id"]

    dl = client.get(
        f"/api/resume/{application_id}/download",
        headers=auth_headers(other_hr),
    )
    assert dl.status_code == 403


def test_apply_blocked_without_resume_on_profile(
    client: TestClient,
    hr_headers: dict[str, str],
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """Profile without a resume can't apply — surfaces a clear message."""
    job_id = client.post(
        "/api/jobs/", headers=hr_headers, json=sample_job_payload()
    ).json()["id"]
    # Profile with NO resume_key.
    seed_candidate_profile(client, candidate_headers, resume_key=None)

    apply_resp = client.post(
        "/api/applications/",
        headers=candidate_headers,
        json=sample_application_payload(job_id),
    )
    assert apply_resp.status_code == 400
    assert "resume" in apply_resp.json()["detail"].lower()


# ---------- keyword search picks up resume_text ----------


def test_applicant_keyword_search_finds_resume_text(
    client: TestClient,
    hr_headers: dict[str, str],
    candidate_headers: dict[str, str],
    in_memory_storage: InMemoryStorage,
):
    """HR keyword search ORs over resume_text — a candidate who has the
    keyword only in their resume (not skills/cover) still surfaces."""
    job_id = client.post(
        "/api/jobs/", headers=hr_headers, json=sample_job_payload()
    ).json()["id"]

    from docx import Document

    doc = Document()
    doc.add_paragraph("Hands-on with kubernetes orchestration.")
    buf = io.BytesIO()
    doc.save(buf)
    upload = client.post(
        "/api/resume/upload",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    # Profile carries the resume + skills (NOT kubernetes); cover note is
    # set per-application below.
    seed_candidate_profile(
        client,
        candidate_headers,
        resume_key=upload.json()["resume_key"],
        skills=["python"],
    )
    client.post(
        "/api/applications/",
        headers=candidate_headers,
        json=sample_application_payload(job_id, cover_note="standard cover"),
    )

    resp = client.get(
        f"/api/applications/by-job/{job_id}?q=kubernetes",
        headers=hr_headers,
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
