from collections.abc import Generator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import Base
from app.services import storage as storage_module


def _ensure_test_database(base_url: str) -> str:
    url = make_url(base_url)
    target = f"{url.database}_test"
    admin_url = url.set(database="postgres")

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target},
            ).first()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{target}"'))
    finally:
        admin_engine.dispose()

    return url.set(database=target).render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def test_engine() -> Generator[Engine, None, None]:
    settings = get_settings()
    test_url = _ensure_test_database(settings.database_url.get_secret_value())
    engine = create_engine(test_url, pool_pre_ping=True, future=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def db(test_engine: Engine) -> Generator[Session, None, None]:
    SessionLocal = sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        with test_engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(
                    text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE')
                )


@pytest.fixture()
def client(test_engine: Engine, db: Session) -> Generator[TestClient, None, None]:
    AppSession = sessionmaker(
        bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
    )

    def _override_get_db() -> Generator[Session, None, None]:
        s = AppSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------- helpers used across tests ----------


def register_user(client: TestClient, *, email: str, password: str, role: str, full_name: str) -> str:
    """Register a user, temporarily allowing HR self-signup if needed.

    Production blocks HR self-registration by default. Most existing tests
    pre-date that policy, so this helper flips the setting just long enough
    to seed both roles via the public endpoint.
    """
    from app.config import get_settings

    settings = get_settings()
    prev = settings.allow_hr_self_register
    settings.allow_hr_self_register = True
    try:
        resp = client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "role": role, "full_name": full_name},
        )
    finally:
        settings.allow_hr_self_register = prev

    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def hr_token(client: TestClient) -> str:
    return register_user(
        client,
        email="hr@example.com",
        password="HrPass1234!",
        role="hr",
        full_name="HR User",
    )


@pytest.fixture()
def candidate_token(client: TestClient) -> str:
    return register_user(
        client,
        email="candidate@example.com",
        password="CandPass1234!",
        role="candidate",
        full_name="Candidate User",
    )


@pytest.fixture()
def hr_headers(hr_token: str) -> dict[str, str]:
    return auth_headers(hr_token)


@pytest.fixture()
def candidate_headers(candidate_token: str) -> dict[str, str]:
    return auth_headers(candidate_token)


def sample_job_payload(**overrides) -> dict:
    payload = {
        "title": "Backend Engineer",
        "description": "Build APIs.",
        "department": "Engineering",
        "location_type": "remote",
        "employment_type": "full_time",
        "exp_min": 2,
        "exp_max": 6,
        "ctc_min": 1_500_000,
        "ctc_max": 3_000_000,
        "skills": ["python", "fastapi"],
        "deadline": None,
    }
    payload.update(overrides)
    return payload


# ---------- in-memory storage stub for resume tests ----------
#
# Real MinIO isn't available in the test container; rather than skip the
# upload path entirely, we swap the storage singleton for an in-memory
# dict that implements the same `put_object` / `head_object` / `iter_object`
# / `delete_object` surface. Tests can then exercise the full upload →
# extract → download flow against actual application rows.


@dataclass
class _StoredItem:
    body: bytes
    content_type: str
    filename: str


class InMemoryStorage:
    def __init__(self) -> None:
        self._items: dict[str, _StoredItem] = {}
        self.bucket = "resumes-test"

    def wait_and_ensure_bucket(self, retries: int = 1, delay: float = 0.0) -> None:
        return

    def put_object(self, *, key: str, body: bytes, content_type: str, filename: str) -> None:
        self._items[key] = _StoredItem(body=body, content_type=content_type, filename=filename)

    def head_object(self, key: str):
        item = self._items.get(key)
        if item is None:
            return None
        return storage_module.StoredObject(
            key=key,
            size=len(item.body),
            content_type=item.content_type,
            filename=item.filename,
        )

    def iter_object(self, key: str, chunk_size: int = 64 * 1024):
        item = self._items[key]
        view = memoryview(item.body)
        for i in range(0, len(item.body), chunk_size):
            yield bytes(view[i : i + chunk_size])

    def delete_object(self, key: str) -> None:
        self._items.pop(key, None)


@pytest.fixture()
def in_memory_storage(monkeypatch: pytest.MonkeyPatch) -> InMemoryStorage:
    """Replace the storage singleton with an in-memory shim for the test.

    The apply endpoint no longer touches storage directly (the resume is
    bound to the candidate's profile, not to each application), so we
    only patch the import sites that actually call `get_storage`:

      - `app.services.storage` itself (the singleton)
      - `app.routers.resume` (upload + per-application download)
      - `app.routers.profile` (PUT validates the new resume_key + the
        new GET /api/profile/resume streams it back inline)
    """
    fake = InMemoryStorage()
    monkeypatch.setattr(storage_module, "_storage", fake)
    monkeypatch.setattr(storage_module, "get_storage", lambda: fake)
    # Patch the import sites that captured `get_storage` by name.
    from app.routers import profile as profile_router
    from app.routers import resume as resume_router

    monkeypatch.setattr(resume_router, "get_storage", lambda: fake)
    monkeypatch.setattr(profile_router, "get_storage", lambda: fake)
    return fake


def sample_application_payload(job_id: int, **overrides) -> dict:
    """Apply payload. All candidate data lives on the profile now — the
    apply endpoint only takes job_id + optional cover_note. Tests that
    exercise the apply path use `seed_candidate_profile` to populate the
    candidate's profile + resume_key first."""
    payload = {
        "job_id": job_id,
        "cover_note": "I would love to apply.",
    }
    payload.update(overrides)
    return payload


def apply_with_profile(
    client: TestClient,
    candidate_headers: dict[str, str],
    job_id: int,
    *,
    skills: list[str] | None = None,
    years_experience: int = 4,
    current_ctc: int = 1_500_000,
    expected_ctc: int = 2_500_000,
    notice_period_days: int = 30,
    is_fresher: bool = False,
    cover_note: str = "I would love to apply.",
    resume_key: str | None = None,
):
    """Convenience for tests that need a candidate to apply with a
    specific profile shape. PUT-upserts the profile (idempotent), then
    POSTs the application. Returns the application's response."""
    seed_candidate_profile(
        client,
        candidate_headers,
        resume_key=resume_key,
        skills=skills,
        years_experience=years_experience,
        current_ctc=current_ctc,
        expected_ctc=expected_ctc,
        notice_period_days=notice_period_days,
        is_fresher=is_fresher,
    )
    return client.post(
        "/api/applications/",
        json={"job_id": job_id, "cover_note": cover_note},
        headers=candidate_headers,
    )


def seed_candidate_profile(
    client: TestClient,
    candidate_headers: dict[str, str],
    *,
    resume_key: str | None = None,
    skills: list[str] | None = None,
    years_experience: int = 4,
    current_ctc: int = 1_500_000,
    expected_ctc: int = 2_500_000,
    notice_period_days: int = 30,
    is_fresher: bool = False,
    experiences: list[dict] | None = None,
    educations: list[dict] | None = None,
) -> dict:
    """Populate a candidate's profile via the public API. Use before any
    test that hits POST /api/applications — the apply endpoint now
    requires a profile with a resume on file."""
    payload = {
        "skills": skills or ["python", "fastapi"],
        "is_fresher": is_fresher,
        "years_experience": 0 if is_fresher else years_experience,
        "current_ctc": 0 if is_fresher else current_ctc,
        "expected_ctc": expected_ctc,
        "notice_period_days": notice_period_days,
        "preferred_locations": ["remote"],
        "experiences": experiences or [],
        "educations": educations or [],
        "resume_key": resume_key,
    }
    resp = client.put("/api/profile/", headers=candidate_headers, json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()
