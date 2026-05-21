"""Idempotent seed of demo users, jobs, applications, and pipeline events.

Two scales of seed live here in one file:

  - **Documented anchors** (always present): the demo HR + demo
    candidate the README points the assessor at, plus a couple of extra
    candidates that show up as "other applicants" in HR-side examples.
  - **Bulk demo data** (generated): ~25 jobs across departments, ~20
    extra candidates with varied skills/CTC/experience, ~200
    applications spread across the six pipeline stages. Enough volume
    that both the candidate browse page (infinite scroll) and the HR
    dashboard (per-stage funnels) actually look like a working hiring
    portal on first boot.

Determinism: every random pick goes through a single `random.Random(42)`
instance so the seed is reproducible — re-run on a fresh `docker compose
down -v` and you get the exact same dataset.

Idempotency: the anchor-user existence check + the "HR already has jobs"
check together gate the whole bulk generation. Re-running run_seed() on
a populated DB is a no-op.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
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
    CandidateEducation,
    CandidateExperience,
    CandidateProfile,
    EmploymentType,
    Job,
    JobStatus,
    LocationType,
    User,
    UserRole,
)
from app.security import hash_password

logger = logging.getLogger(__name__)


# Deterministic randomness — same seed → same demo data on every fresh
# boot. The number itself doesn't matter; pinning it is what matters.
_RNG = random.Random(42)


# ---------- user helpers ----------


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


# ---------- candidate pool ----------
#
# Twenty extra demo candidates so the HR "Candidate inbox" and per-job
# applicant lists feel populated. Names span Indian and Western — the
# product targets a multi-region hiring use case, and the seed should
# reflect that. Skills/CTC vary so HR filters actually prune.


@dataclass
class _CandidateSpec:
    full_name: str
    email: str
    skills: list[str]
    years_experience: int
    base_ctc: int


_CANDIDATE_POOL: list[_CandidateSpec] = [
    _CandidateSpec("Rohan Mehta", "rohan.designer@test.com", ["figma", "ui-ux", "css"], 5, 1_800_000),
    _CandidateSpec("Sneha Patel", "sneha.engineer@test.com", ["python", "django", "postgres"], 7, 2_800_000),
    _CandidateSpec("Aisha Khan", "aisha.k@test.com", ["python", "fastapi", "kafka", "aws"], 8, 3_400_000),
    _CandidateSpec("Vikram Singh", "vikram.s@test.com", ["java", "spring", "kafka"], 6, 2_200_000),
    _CandidateSpec("Priya Iyer", "priya.iyer@test.com", ["react", "typescript", "redux"], 4, 1_900_000),
    _CandidateSpec("Karan Joshi", "karan.j@test.com", ["go", "docker", "kubernetes"], 5, 2_400_000),
    _CandidateSpec("Liam O'Connor", "liam.o@test.com", ["python", "data-engineering", "spark"], 9, 3_800_000),
    _CandidateSpec("Mei Tanaka", "mei.tanaka@test.com", ["react", "next-js", "graphql"], 3, 1_500_000),
    _CandidateSpec("Daniel García", "daniel.g@test.com", ["sql", "python", "tableau"], 4, 1_600_000),
    _CandidateSpec("Ananya Roy", "ananya.r@test.com", ["python", "machine-learning", "pytorch"], 6, 2_600_000),
    _CandidateSpec("Faisal Ahmed", "faisal.a@test.com", ["terraform", "aws", "github-actions"], 7, 3_000_000),
    _CandidateSpec("Hannah Müller", "hannah.m@test.com", ["product-design", "figma", "user-research"], 5, 1_900_000),
    _CandidateSpec("Rahul Verma", "rahul.v@test.com", ["python", "fastapi", "docker", "postgres"], 3, 1_400_000),
    _CandidateSpec("Olivia Brooks", "olivia.b@test.com", ["javascript", "node", "express"], 4, 1_700_000),
    _CandidateSpec("Saanvi Reddy", "saanvi.r@test.com", ["sql", "looker", "bigquery"], 2, 1_100_000),
    _CandidateSpec("Mateo Rossi", "mateo.r@test.com", ["rust", "systems-programming"], 8, 3_500_000),
    _CandidateSpec("Tanvi Shah", "tanvi.s@test.com", ["react", "typescript", "tailwind", "vite"], 5, 2_000_000),
    _CandidateSpec("Jonas Becker", "jonas.b@test.com", ["go", "grpc", "kubernetes"], 6, 2_700_000),
    _CandidateSpec("Riya Banerjee", "riya.b@test.com", ["data-science", "python", "r"], 5, 2_300_000),
    _CandidateSpec("Aaron Wright", "aaron.w@test.com", ["sales-operations", "salesforce", "sql"], 6, 1_800_000),
]


_INSTITUTIONS = [
    "IIT Bombay", "IIT Delhi", "IIT Madras", "BITS Pilani", "NIT Trichy",
    "VIT Vellore", "Manipal Institute", "Stanford University", "MIT",
    "Carnegie Mellon", "University of Waterloo", "ETH Zürich",
]
_DEGREES = ["B.Tech", "B.E.", "M.Tech", "MS", "MBA"]
_FIELDS = [
    "Computer Science", "Information Technology", "Electronics",
    "Data Science", "Software Engineering", "Mechanical Engineering",
]
_COMPANIES = [
    "Acme Corp", "Globex", "Initech", "Vehement Capital", "Stark Industries",
    "Wayne Enterprises", "Hooli", "Pied Piper", "Aperture Labs",
    "Massive Dynamic", "Cyberdyne Systems", "Tyrell Corp",
]


def _generate_experience_for(spec: _CandidateSpec) -> list[dict]:
    """Synthesize 1-2 prior-job entries that line up with the candidate's
    total YOE. Last role is "current" (is_current=True), prior role (if
    any) is dated to land back-to-back."""
    if spec.years_experience <= 0:
        return []
    today = date.today()
    if spec.years_experience <= 3:
        return [
            dict(
                company=_RNG.choice(_COMPANIES),
                role=f"{_RNG.choice(['Junior', 'Software'])} Engineer",
                from_date=today.replace(year=today.year - spec.years_experience),
                to_date=None,
                is_current=True,
                description=None,
            )
        ]
    # >3y: split into 2 stints
    split = max(1, spec.years_experience // 2)
    prior_start = today.replace(year=today.year - spec.years_experience)
    prior_end = today.replace(year=today.year - split)
    return [
        dict(
            company=_RNG.choice(_COMPANIES),
            role="Senior Engineer" if spec.years_experience >= 6 else "Engineer",
            from_date=today.replace(year=today.year - split),
            to_date=None,
            is_current=True,
            description=None,
        ),
        dict(
            company=_RNG.choice(_COMPANIES),
            role="Engineer",
            from_date=prior_start,
            to_date=prior_end,
            is_current=False,
            description=None,
        ),
    ]


def _generate_education_for(spec: _CandidateSpec) -> list[dict]:
    """One education entry per candidate. Graduation year is roughly
    today - (years_experience + 22) so freshers graduated this year."""
    today = date.today()
    grad_year = today.year - max(0, spec.years_experience)
    return [
        dict(
            institution=_RNG.choice(_INSTITUTIONS),
            degree=_RNG.choice(_DEGREES),
            field_of_study=_RNG.choice(_FIELDS),
            from_year=grad_year - 4,
            to_year=grad_year,
        )
    ]


def _profile_snapshot_for(profile: CandidateProfile) -> dict:
    """Mirror of `lifecycle._profile_snapshot` — kept here so the seed
    doesn't need to import a private helper. Stays in sync with the
    apply path's serialization."""
    return {
        "is_fresher": profile.is_fresher,
        "experiences": [
            {
                "company": e.company,
                "role": e.role,
                "from_date": e.from_date.isoformat() if e.from_date else None,
                "to_date": e.to_date.isoformat() if e.to_date else None,
                "is_current": e.is_current,
                "description": e.description,
            }
            for e in (profile.experiences or [])
        ],
        "educations": [
            {
                "institution": d.institution,
                "degree": d.degree,
                "field_of_study": d.field_of_study,
                "from_year": d.from_year,
                "to_year": d.to_year,
            }
            for d in (profile.educations or [])
        ],
    }


def _seed_profile(db: Session, user: User, spec: _CandidateSpec) -> CandidateProfile:
    """Create (or fetch) a profile for `user` populated from `spec`. The
    profile carries the same data the candidate would have entered on
    /me/profile in the demo; we exercise the same shape the apply
    endpoint expects so HR-drawer rendering is identical."""
    profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    if profile is not None:
        return profile

    is_fresher = spec.years_experience == 0
    profile = CandidateProfile(
        user_id=user.id,
        skills=spec.skills,
        is_fresher=is_fresher,
        years_experience=spec.years_experience,
        current_ctc=0 if is_fresher else int(spec.base_ctc * _RNG.uniform(0.85, 1.15)),
        expected_ctc=int(spec.base_ctc * _RNG.uniform(1.15, 1.4)),
        notice_period_days=_RNG.choice([0, 15, 30, 60, 90]),
        preferred_locations=[_RNG.choice(["remote", "hybrid", "onsite"])],
        # No resume on seed profiles — HR drawer shows "No resume on file"
        # for the seeded applications. The primary candidate uploads on
        # the /me/profile page to exercise the apply flow end-to-end.
        resume_key=None,
    )
    db.add(profile)
    db.flush()

    for exp in _generate_experience_for(spec):
        db.add(CandidateExperience(candidate_id=profile.id, **exp))
    for edu in _generate_education_for(spec):
        db.add(CandidateEducation(candidate_id=profile.id, **edu))
    db.commit()
    db.refresh(profile)
    return profile


def _seed_candidates(db: Session) -> list[tuple[User, CandidateProfile]]:
    """Provision each pool candidate as user + populated profile. The
    profile is what the bulk-apply step snapshots into Application rows,
    so this needs to happen first."""
    out: list[tuple[User, CandidateProfile]] = []
    for spec in _CANDIDATE_POOL:
        user = _get_or_create_user(
            db,
            email=spec.email,
            password="Test@1234",
            full_name=spec.full_name,
            role=UserRole.candidate,
        )
        profile = _seed_profile(db, user, spec)
        out.append((user, profile))
    return out


# ---------- job catalogue ----------
#
# ~25 jobs across departments. Each job gets a deadline `random` days
# out from today so the deadline pill on the candidate browse shows a
# mix of urgent / comfortable timelines.


@dataclass
class _JobSpec:
    title: str
    department: str
    location: LocationType
    employment: EmploymentType
    exp_min: int
    exp_max: int
    ctc_min: int
    ctc_max: int
    skills: list[str]
    description: str


_JOB_CATALOGUE: list[_JobSpec] = [
    # ---------- Engineering ----------
    _JobSpec(
        "Senior Backend Engineer", "Engineering", LocationType.remote, EmploymentType.full_time,
        5, 9, 2_500_000, 4_000_000,
        ["python", "fastapi", "postgres", "aws"],
        "Build and operate the API platform powering our customer-facing apps. You'll own services end to end — design, code, deploy, and on-call.",
    ),
    _JobSpec(
        "Backend Engineer (Mid-level)", "Engineering", LocationType.hybrid, EmploymentType.full_time,
        2, 5, 1_400_000, 2_500_000,
        ["python", "django", "postgres"],
        "Help us ship the next set of platform services. Strong Python + Postgres background needed.",
    ),
    _JobSpec(
        "Frontend Engineer (React)", "Engineering", LocationType.hybrid, EmploymentType.full_time,
        2, 5, 1_500_000, 2_800_000,
        ["react", "typescript", "tailwind"],
        "Help build the next-gen hiring portal UI. Strong React + TypeScript needed.",
    ),
    _JobSpec(
        "Senior Frontend Engineer", "Engineering", LocationType.remote, EmploymentType.full_time,
        5, 9, 2_600_000, 4_200_000,
        ["react", "typescript", "graphql", "vite"],
        "Own the candidate-facing surface. Performance + accessibility focus.",
    ),
    _JobSpec(
        "Full-stack Engineer", "Engineering", LocationType.remote, EmploymentType.full_time,
        3, 6, 1_800_000, 3_000_000,
        ["python", "fastapi", "react", "typescript"],
        "Roll across the stack — same week could be query plans and component refactors.",
    ),
    _JobSpec(
        "Engineering Manager", "Engineering", LocationType.hybrid, EmploymentType.full_time,
        7, 12, 3_500_000, 5_500_000,
        ["leadership", "system-design", "mentoring"],
        "Lead one of our platform pods. We expect hands-on technical depth and people-first leadership.",
    ),
    _JobSpec(
        "Engineering Intern", "Engineering", LocationType.onsite, EmploymentType.internship,
        0, 1, 300_000, 500_000,
        ["python", "react"],
        "Summer internship across backend and frontend. Mentored project.",
    ),
    _JobSpec(
        "Mobile Engineer (React Native)", "Engineering", LocationType.remote, EmploymentType.full_time,
        3, 7, 1_800_000, 3_200_000,
        ["react-native", "typescript", "ios", "android"],
        "Bring the portal to mobile. iOS + Android shipped on a shared React Native codebase.",
    ),

    # ---------- Data ----------
    _JobSpec(
        "Data Analyst", "Data", LocationType.onsite, EmploymentType.full_time,
        1, 4, 1_000_000, 1_800_000,
        ["sql", "python", "tableau"],
        "Partner with Product and Ops to turn data into decisions. SQL fluency required.",
    ),
    _JobSpec(
        "Senior Data Engineer", "Data", LocationType.remote, EmploymentType.full_time,
        5, 9, 2_400_000, 4_000_000,
        ["python", "spark", "airflow", "bigquery"],
        "Own the pipelines that feed every dashboard. Strong Python + Spark + warehouse experience needed.",
    ),
    _JobSpec(
        "ML Engineer", "Data", LocationType.hybrid, EmploymentType.full_time,
        4, 8, 2_500_000, 4_200_000,
        ["python", "pytorch", "machine-learning", "aws"],
        "Productionise models — from notebook to gRPC service. Hands-on ML + systems background.",
    ),
    _JobSpec(
        "BI Developer", "Data", LocationType.remote, EmploymentType.contract,
        2, 5, 1_200_000, 2_200_000,
        ["sql", "looker", "tableau", "dbt"],
        "Six-month contract to stand up our BI layer. Looker + dbt expertise required.",
    ),

    # ---------- Platform / DevOps ----------
    _JobSpec(
        "DevOps Contractor", "Platform", LocationType.remote, EmploymentType.contract,
        4, 10, 2_000_000, 3_500_000,
        ["kubernetes", "terraform", "aws", "github-actions"],
        "6-month engagement to harden our CI/CD and Kubernetes setup.",
    ),
    _JobSpec(
        "Site Reliability Engineer", "Platform", LocationType.hybrid, EmploymentType.full_time,
        4, 8, 2_400_000, 4_000_000,
        ["aws", "kubernetes", "terraform", "observability"],
        "On-call rotation + reliability projects. Improve our SLOs end-to-end.",
    ),
    _JobSpec(
        "Security Engineer", "Platform", LocationType.remote, EmploymentType.full_time,
        4, 9, 2_600_000, 4_200_000,
        ["application-security", "appsec", "aws"],
        "Threat-model + audit our services. Drive security-by-default into every team.",
    ),

    # ---------- Design ----------
    _JobSpec(
        "Product Designer", "Design", LocationType.hybrid, EmploymentType.full_time,
        3, 7, 1_500_000, 2_800_000,
        ["figma", "ui-ux", "user-research", "product-design"],
        "Design end-to-end flows for the HR + candidate sides. Strong portfolio expected.",
    ),
    _JobSpec(
        "UX Researcher", "Design", LocationType.remote, EmploymentType.full_time,
        3, 7, 1_500_000, 2_600_000,
        ["user-research", "interviewing", "synthesis"],
        "Run discovery + usability research across both audiences. Partner closely with PM + design.",
    ),

    # ---------- Product ----------
    _JobSpec(
        "Product Manager", "Product", LocationType.hybrid, EmploymentType.full_time,
        4, 8, 2_500_000, 4_000_000,
        ["product-management", "roadmapping", "data-analysis"],
        "Own a product surface. Drive discovery → launch → measurement, end to end.",
    ),
    _JobSpec(
        "Associate Product Manager", "Product", LocationType.onsite, EmploymentType.full_time,
        1, 3, 1_200_000, 1_800_000,
        ["product-management", "analytics", "communication"],
        "Junior PM role on the candidate-side surface. Strong analytical + communication skills.",
    ),

    # ---------- Sales ----------
    _JobSpec(
        "Account Executive", "Sales", LocationType.hybrid, EmploymentType.full_time,
        3, 7, 1_500_000, 3_500_000,
        ["b2b-sales", "salesforce", "negotiation"],
        "Hunt + close mid-market accounts. Strong outbound + Salesforce skills.",
    ),
    _JobSpec(
        "Sales Development Rep", "Sales", LocationType.onsite, EmploymentType.full_time,
        0, 2, 600_000, 1_200_000,
        ["outbound", "salesforce", "communication"],
        "Top-of-funnel hunter. SDR → AE growth path.",
    ),

    # ---------- Marketing ----------
    _JobSpec(
        "Content Marketer", "Marketing", LocationType.remote, EmploymentType.full_time,
        2, 5, 1_000_000, 1_800_000,
        ["content-marketing", "seo", "writing"],
        "Run our content engine — blog, social, long-form. SEO + writing required.",
    ),
    _JobSpec(
        "Performance Marketing Manager", "Marketing", LocationType.hybrid, EmploymentType.full_time,
        4, 7, 1_800_000, 3_000_000,
        ["performance-marketing", "google-ads", "facebook-ads"],
        "Own paid acquisition end-to-end. Strong analytics + creative-judgement combo.",
    ),

    # ---------- Customer Success ----------
    _JobSpec(
        "Customer Success Manager", "Customer Success", LocationType.remote, EmploymentType.full_time,
        3, 6, 1_400_000, 2_400_000,
        ["account-management", "customer-success", "communication"],
        "Own retention + expansion for our top accounts. Strong technical curiosity expected.",
    ),
    _JobSpec(
        "Implementation Engineer", "Customer Success", LocationType.hybrid, EmploymentType.full_time,
        3, 6, 1_600_000, 2_800_000,
        ["sql", "api-integration", "customer-success"],
        "Technical onboarding for enterprise customers. SQL + REST + customer-facing experience.",
    ),
]


def _seed_jobs(db: Session, hr: User) -> list[Job]:
    existing = db.scalars(select(Job).where(Job.hr_id == hr.id)).all()
    if existing:
        return list(existing)

    today = date.today()
    jobs: list[Job] = []
    for spec in _JOB_CATALOGUE:
        # Deadlines fan out from 7 to 75 days. A handful close in <14 days so
        # the urgency-tinted deadline pills show up on the browse page.
        deadline_offset = _RNG.randint(7, 75)
        job = Job(
            hr_id=hr.id,
            status=JobStatus.active,
            title=spec.title,
            description=spec.description,
            department=spec.department,
            location_type=spec.location,
            employment_type=spec.employment,
            exp_min=spec.exp_min,
            exp_max=spec.exp_max,
            ctc_min=spec.ctc_min,
            ctc_max=spec.ctc_max,
            skills=spec.skills,
            deadline=today + timedelta(days=deadline_offset),
        )
        db.add(job)
        jobs.append(job)
    db.commit()
    for j in jobs:
        db.refresh(j)
    return jobs


# ---------- application generator ----------
#
# Build ~200 applications by sampling candidate↔job pairs, then assign a
# stage according to a realistic funnel distribution.


_STAGE_WEIGHTS: list[tuple[ApplicationStage, int]] = [
    (ApplicationStage.applied, 40),
    (ApplicationStage.screening, 22),
    (ApplicationStage.interview, 15),
    (ApplicationStage.offer, 8),
    (ApplicationStage.hired, 5),
    (ApplicationStage.rejected, 10),
]

_STAGE_PROGRESSION: list[ApplicationStage] = [
    ApplicationStage.applied,
    ApplicationStage.screening,
    ApplicationStage.interview,
    ApplicationStage.offer,
    ApplicationStage.hired,
]


def _pick_stage() -> ApplicationStage:
    population = [s for s, _ in _STAGE_WEIGHTS]
    weights = [w for _, w in _STAGE_WEIGHTS]
    return _RNG.choices(population, weights=weights, k=1)[0]


def _cover_note_for(job: Job, candidate_skills: list[str]) -> str:
    overlap = [s for s in candidate_skills if s in job.skills][:3]
    if overlap:
        return (
            f"Excited about this {job.title} role at your team — happy to dig into "
            f"my experience with {', '.join(overlap)} during the screen."
        )
    return (
        f"Open to the {job.title} role and would love to hear more about how the team works "
        "and what the first 90 days look like."
    )


def _seed_applications(
    db: Session,
    jobs: list[Job],
    primary_candidate: User,
    pool: list[tuple[User, CandidateProfile]],
) -> None:
    has_any = db.scalar(
        select(Application).where(Application.candidate_id == primary_candidate.id).limit(1)
    )
    if has_any is not None:
        return

    hr_user = db.get(User, jobs[0].hr_id) if jobs else None

    # Map candidate id → their spec so we can compute realistic CTC ranges
    # for each application (current_ctc tracks YOE; expected_ctc nudges up).
    spec_by_email = {s.email: s for s in _CANDIDATE_POOL}

    # ----- anchor: the primary candidate gets a clean two-app pipeline -----
    # Two named applications so the README's "log in as candidate and see
    # your apps" walkthrough lands on real rows.
    backend_jobs = [j for j in jobs if "Backend" in j.title]
    frontend_jobs = [j for j in jobs if "Frontend" in j.title]
    anchor_seeds: list[tuple[Job, ApplicationStage, dict]] = []
    if backend_jobs:
        anchor_seeds.append((backend_jobs[0], ApplicationStage.screening, dict(
            current_ctc=1_800_000,
            expected_ctc=3_200_000,
            notice_period_days=30,
            years_experience=6,
            skills=["python", "fastapi", "postgres", "docker"],
            cover_note="I've shipped Python microservices at scale and would love to lead backend here.",
        )))
    if frontend_jobs:
        anchor_seeds.append((frontend_jobs[0], ApplicationStage.applied, dict(
            current_ctc=1_800_000,
            expected_ctc=2_400_000,
            notice_period_days=30,
            years_experience=4,
            skills=["react", "typescript", "css"],
            cover_note="React side-projects shipped; happy to discuss portfolio.",
        )))

    created_pairs: set[tuple[int, int]] = set()

    def _persist_application(
        candidate: User,
        job: Job,
        stage: ApplicationStage,
        fields: dict,
        snapshot: dict | None = None,
    ) -> None:
        application = Application(
            job_id=job.id,
            candidate_id=candidate.id,
            resume_key=None,
            resume_filename=None,
            resume_size_bytes=None,
            resume_content_type=None,
            resume_text=None,
            profile_snapshot=snapshot,
            stage=stage,
            **fields,
        )
        db.add(application)
        db.flush()

        # Walk the stage history so the timeline view has something to show
        # instead of just one event per row.
        if stage == ApplicationStage.rejected:
            walk = [ApplicationStage.applied, ApplicationStage.rejected]
        else:
            walk = []
            for s in _STAGE_PROGRESSION:
                walk.append(s)
                if s == stage:
                    break

        previous: ApplicationStage | None = None
        for s in walk:
            db.add(
                ApplicationEvent(
                    application_id=application.id,
                    from_stage=previous,
                    to_stage=s,
                    changed_by_user_id=(
                        candidate.id if previous is None else (hr_user.id if hr_user else candidate.id)
                    ),
                )
            )
            previous = s

    # Primary candidate's profile (if seeded) → snapshot for the anchor apps.
    primary_profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == primary_candidate.id)
    )
    primary_snapshot = (
        _profile_snapshot_for(primary_profile) if primary_profile is not None else None
    )
    for job, stage, fields in anchor_seeds:
        _persist_application(
            primary_candidate, job, stage, fields, snapshot=primary_snapshot
        )
        created_pairs.add((primary_candidate.id, job.id))

    # ----- bulk fill -----
    # Each pool candidate applies to between 5 and 12 jobs, with stages
    # drawn from the funnel weights. Unique (candidate_id, job_id) is
    # enforced by the DB unique index — we shadow-check here to avoid
    # IntegrityError noise.

    for candidate, profile in pool:
        n_apps = _RNG.randint(5, 12)
        candidate_jobs = _RNG.sample(jobs, k=min(n_apps, len(jobs)))
        snapshot = _profile_snapshot_for(profile)
        for job in candidate_jobs:
            key = (candidate.id, job.id)
            if key in created_pairs:
                continue
            stage = _pick_stage()
            # Snapshot the filterable fields straight from the profile —
            # mirror of what the apply endpoint does when a real candidate
            # hits POST /api/applications.
            _persist_application(
                candidate,
                job,
                stage,
                dict(
                    current_ctc=profile.current_ctc,
                    expected_ctc=profile.expected_ctc,
                    notice_period_days=profile.notice_period_days,
                    years_experience=profile.years_experience,
                    skills=list(profile.skills or []),
                    cover_note=_cover_note_for(job, list(profile.skills or [])),
                ),
                snapshot=snapshot,
            )
            created_pairs.add(key)

    db.commit()

    # One illustrative HR note so the drawer has something on first load.
    offer_app = db.scalar(
        select(Application).where(Application.stage == ApplicationStage.offer).limit(1)
    )
    if offer_app is not None and not offer_app.notes and hr_user is not None:
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
        primary_user = _get_or_create_user(
            db,
            email=settings.seed_candidate_email,
            password=settings.seed_candidate_password.get_secret_value(),
            full_name="Arjun Kumar",
            role=UserRole.candidate,
        )

        # Primary candidate profile — populated so applying to a new job in
        # the demo works (skills, exp, CTC, education snapshot into the
        # application). Resume is intentionally NOT preloaded so the
        # assessor sees the "upload your CV on your profile before applying"
        # gate when they exercise the apply flow.
        primary_spec = _CandidateSpec(
            full_name="Arjun Kumar",
            email=settings.seed_candidate_email,
            skills=["python", "fastapi", "postgres", "docker", "react"],
            years_experience=6,
            base_ctc=2_400_000,
        )
        _seed_profile(db, primary_user, primary_spec)

        pool = _seed_candidates(db)
        jobs = _seed_jobs(db, hr)
        _seed_applications(db, jobs, primary_user, pool)

        # Boot log gives the operator a quick "did the bulk seed actually
        # run?" sanity check.
        from sqlalchemy import func

        total_apps = db.scalar(select(func.count(Application.id))) or 0

        logger.info(
            "Seed complete: HR=%s, primary candidate=%s, demo candidates=%d, jobs=%d, applications=%d",
            hr.email,
            primary_user.email,
            len(pool),
            len(jobs),
            total_apps,
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_seed()
