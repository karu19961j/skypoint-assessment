"""Idempotent seed of test users + sample jobs/applications.

Re-running this is safe: existence checks gate every insert.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    Application,
    ApplicationEvent,
    ApplicationNote,
    ApplicationStage,
    EmploymentType,
    Job,
    JobStatus,
    LocationType,
    User,
    UserRole,
)
from app.security import hash_password

logger = logging.getLogger(__name__)


def _get_or_create_user(
    db: Session, *, email: str, password: str, full_name: str, role: UserRole
) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is not None:
        return user
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_jobs(db: Session, hr: User) -> list[Job]:
    existing = db.scalars(select(Job).where(Job.hr_id == hr.id)).all()
    if existing:
        return list(existing)

    today = date.today()
    jobs_data = [
        dict(
            title="Senior Backend Engineer",
            description=(
                "Build and operate the API platform powering our customer-facing apps. "
                "You'll own services end to end — design, code, deploy, and on-call."
            ),
            department="Engineering",
            location_type=LocationType.remote,
            employment_type=EmploymentType.full_time,
            exp_min=5,
            exp_max=9,
            ctc_min=2_500_000,
            ctc_max=4_000_000,
            skills=["python", "fastapi", "postgres", "aws"],
            deadline=today + timedelta(days=30),
        ),
        dict(
            title="Frontend Engineer (React)",
            description=(
                "Help build the next-gen hiring portal UI. Strong React + TypeScript needed."
            ),
            department="Engineering",
            location_type=LocationType.hybrid,
            employment_type=EmploymentType.full_time,
            exp_min=2,
            exp_max=5,
            ctc_min=1_500_000,
            ctc_max=2_800_000,
            skills=["react", "typescript", "tailwind"],
            deadline=today + timedelta(days=45),
        ),
        dict(
            title="Data Analyst",
            description="Partner with Product and Ops to turn data into decisions. SQL fluency required.",
            department="Data",
            location_type=LocationType.onsite,
            employment_type=EmploymentType.full_time,
            exp_min=1,
            exp_max=4,
            ctc_min=1_000_000,
            ctc_max=1_800_000,
            skills=["sql", "python", "tableau"],
            deadline=today + timedelta(days=21),
        ),
        dict(
            title="DevOps Contractor",
            description="6-month engagement to harden our CI/CD and Kubernetes setup.",
            department="Platform",
            location_type=LocationType.remote,
            employment_type=EmploymentType.contract,
            exp_min=4,
            exp_max=10,
            ctc_min=2_000_000,
            ctc_max=3_500_000,
            skills=["kubernetes", "terraform", "aws", "github-actions"],
            deadline=today + timedelta(days=14),
        ),
        dict(
            title="Engineering Intern",
            description="Summer internship across backend and frontend. Mentored project.",
            department="Engineering",
            location_type=LocationType.onsite,
            employment_type=EmploymentType.internship,
            exp_min=0,
            exp_max=1,
            ctc_min=300_000,
            ctc_max=500_000,
            skills=["python", "react"],
            deadline=today + timedelta(days=60),
        ),
    ]

    jobs: list[Job] = []
    for data in jobs_data:
        job = Job(hr_id=hr.id, status=JobStatus.active, **data)
        db.add(job)
        jobs.append(job)
    db.commit()
    for j in jobs:
        db.refresh(j)
    return jobs


def _seed_applications(
    db: Session, jobs: list[Job], primary_candidate: User, others: list[User]
) -> None:
    # Only seed apps if the primary candidate has none yet (idempotency anchor).
    has_any = db.scalar(
        select(Application).where(Application.candidate_id == primary_candidate.id).limit(1)
    )
    if has_any is not None:
        return

    by_title = {j.title: j for j in jobs}
    seeds = [
        # Primary candidate applies to two jobs.
        dict(
            candidate=primary_candidate,
            job=by_title["Senior Backend Engineer"],
            stage=ApplicationStage.screening,
            current_ctc=1_800_000,
            expected_ctc=3_200_000,
            notice_period_days=30,
            years_experience=6,
            skills=["python", "fastapi", "postgres", "docker"],
            cover_note="I've shipped Python microservices at scale and would love to lead backend here.",
        ),
        dict(
            candidate=primary_candidate,
            job=by_title["Frontend Engineer (React)"],
            stage=ApplicationStage.applied,
            current_ctc=1_800_000,
            expected_ctc=2_400_000,
            notice_period_days=30,
            years_experience=4,
            skills=["react", "typescript", "css"],
            cover_note="React side-projects shipped; happy to discuss portfolio.",
        ),
        # Others fill the pipeline.
        dict(
            candidate=others[0],
            job=by_title["Senior Backend Engineer"],
            stage=ApplicationStage.interview,
            current_ctc=2_400_000,
            expected_ctc=3_800_000,
            notice_period_days=60,
            years_experience=8,
            skills=["python", "fastapi", "kafka", "aws"],
            cover_note="Built event-driven systems for the last 4 years; deep Python expertise.",
        ),
        dict(
            candidate=others[1],
            job=by_title["Senior Backend Engineer"],
            stage=ApplicationStage.offer,
            current_ctc=2_800_000,
            expected_ctc=3_500_000,
            notice_period_days=15,
            years_experience=7,
            skills=["python", "django", "postgres"],
            cover_note="Looking for a remote-first role with strong engineering culture.",
        ),
        dict(
            candidate=others[0],
            job=by_title["Data Analyst"],
            stage=ApplicationStage.applied,
            current_ctc=1_200_000,
            expected_ctc=1_700_000,
            notice_period_days=0,
            years_experience=3,
            skills=["sql", "python", "looker"],
            cover_note="Immediate joiner with end-to-end analytics experience.",
        ),
    ]

    stage_progression: list[ApplicationStage] = [
        ApplicationStage.applied,
        ApplicationStage.screening,
        ApplicationStage.interview,
        ApplicationStage.offer,
        ApplicationStage.hired,
    ]

    hr_user = db.get(User, jobs[0].hr_id) if jobs else None

    for s in seeds:
        candidate: User = s["candidate"]
        job: Job = s["job"]
        final_stage: ApplicationStage = s["stage"]

        application = Application(
            job_id=job.id,
            candidate_id=candidate.id,
            resume_link="https://example.com/resume.pdf",
            cover_note=s["cover_note"],
            current_ctc=s["current_ctc"],
            expected_ctc=s["expected_ctc"],
            notice_period_days=s["notice_period_days"],
            years_experience=s["years_experience"],
            skills=s["skills"],
            stage=final_stage,
        )
        db.add(application)
        db.flush()

        # Seed a plausible event history walking from "applied" up to the final stage.
        if final_stage == ApplicationStage.rejected:
            walk = [ApplicationStage.applied, ApplicationStage.rejected]
        else:
            walk = []
            for stage in stage_progression:
                walk.append(stage)
                if stage == final_stage:
                    break

        previous: ApplicationStage | None = None
        for stage in walk:
            db.add(
                ApplicationEvent(
                    application_id=application.id,
                    from_stage=previous,
                    to_stage=stage,
                    changed_by_user_id=candidate.id if previous is None else (hr_user.id if hr_user else candidate.id),
                )
            )
            previous = stage
    db.commit()

    # One illustrative HR note on the offer-stage candidate.
    offer_app = db.scalar(
        select(Application)
        .where(Application.job_id == by_title["Senior Backend Engineer"].id)
        .where(Application.stage == ApplicationStage.offer)
    )
    if offer_app is not None and not offer_app.notes:
        hr_user = db.get(User, jobs[0].hr_id)
        if hr_user is not None:
            db.add(
                ApplicationNote(
                    application_id=offer_app.id,
                    hr_id=hr_user.id,
                    body="Strong system-design round. Pending finance sign-off on offer.",
                )
            )
            db.commit()


def run_seed() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        hr = _get_or_create_user(
            db,
            email=settings.seed_hr_email,
            password=settings.seed_hr_password.get_secret_value(),
            full_name="Priya Sharma (HR)",
            role=UserRole.hr,
        )
        candidate = _get_or_create_user(
            db,
            email=settings.seed_candidate_email,
            password=settings.seed_candidate_password.get_secret_value(),
            full_name="Arjun Kumar",
            role=UserRole.candidate,
        )
        other_1 = _get_or_create_user(
            db,
            email="rohan.designer@test.com",
            password="Test@1234",
            full_name="Rohan Mehta",
            role=UserRole.candidate,
        )
        other_2 = _get_or_create_user(
            db,
            email="sneha.engineer@test.com",
            password="Test@1234",
            full_name="Sneha Patel",
            role=UserRole.candidate,
        )

        jobs = _seed_jobs(db, hr)
        _seed_applications(db, jobs, candidate, [other_1, other_2])

        logger.info(
            "Seed complete: HR=%s, Candidate=%s, Jobs=%d", hr.email, candidate.email, len(jobs)
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_seed()
