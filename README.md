# Skypoint Job Portal

A full-stack hiring portal built for the Skypoint Cloud Claude Code assessment. Two roles — **HR** (post jobs, manage the candidate pipeline) and **Candidate** (browse jobs, apply, track applications) — share one app, gated by JWT-based authentication and a role-aware UI.

[![CI](https://github.com/karu19961j/skypoint-assessment/actions/workflows/ci.yml/badge.svg)](https://github.com/karu19961j/skypoint-assessment/actions/workflows/ci.yml)

---

## 1. Project overview

The app models a hiring pipeline end to end:

- HR can post, edit, pause, close, and delete job listings; review every applicant for a job through a six-stage pipeline (Applied → Screening → Interview → Offer → Hired / Rejected); add private notes; and slice applicants by skills, CTC, notice period, experience, and applied-date range.
- Candidates can browse all active jobs with rich filters and a keyword search, save jobs they like, apply with a resume link + structured profile, **see their progression on a per-application timeline**, and withdraw while the application is still in the *Applied* stage.
- An HR dashboard surfaces counts of active/paused/closed jobs, applications received today and this week, and a per-job stage funnel.
- **Live deadline countdown** on every job card and detail page (e.g. *Closes in 5 days* → *Closes today* → *Closed*).

The codebase aims to demonstrate clean separation of concerns, input validation at every boundary, role-aware authorization, transparent Docker orchestration, accessibility-aware UI, and good test coverage of the role/permission boundaries on both ends of the stack.

---

## 2. Architecture

```
 ┌──────────────────┐         ┌───────────────────┐         ┌───────────────────┐
 │      Browser     │ ───────▶│   frontend        │ ───────▶│    backend        │
 │   (React SPA)    │         │   nginx :80       │         │   FastAPI :8000   │
 │                  │         │   serves /        │         │   /api/*          │
 │                  │         │   proxies /api/*  │         │                   │
 └──────────────────┘         └───────────────────┘         └─────────┬─────────┘
        host :5173                                                    │
                                                                       ▼
                                                          ┌──────────────────────┐
                                                          │  postgres :5432       │
                                                          │  (named volume)       │
                                                          └──────────────────────┘
```

Three Docker services on a private bridge network:

| Service     | Image / build              | Purpose                                                                                |
|-------------|----------------------------|----------------------------------------------------------------------------------------|
| `postgres`  | `postgres:16-alpine`       | Persistent storage (named volume `pgdata`).                                            |
| `backend`   | `./backend` (FastAPI)      | REST API at `/api/*`. Bootstraps schema + seed on startup. Internal-only (not exposed).|
| `frontend`  | `./frontend` (multi-stage) | Vite builds the React app; nginx serves the static bundle and proxies `/api/*` to the backend service over the Docker network. |

Only the frontend is exposed to the host (port `5173 → 80`). All backend traffic — including from the browser — flows through nginx, so the browser only ever speaks to one origin.

Auth uses short-lived JWTs (HS256, 30-minute expiry); the secret is read from `JWT_SECRET` in the environment. Passwords are stored as bcrypt hashes (cost factor 12).

---

## 3. How to run

```bash
git clone git@github.com:karu19961j/skypoint-assessment.git
cd skypoint-assessment
cp .env.example .env
docker compose up --build
```

Then open **http://localhost:5173** in your browser.

The backend waits for Postgres' health check, runs `Base.metadata.create_all` to set up the schema, and idempotently seeds the demo data on every startup. The whole stack is ready when you see `Application startup complete.` in the backend logs.

> No additional setup is required. All configuration lives in `.env`; the committed `.env.example` documents every value and ships with safe local defaults.

To stop and remove data:

```bash
docker compose down -v
```

### Interactive API docs

FastAPI generates an OpenAPI spec at runtime, served at:

- **Swagger UI:** http://localhost:5173/api/docs
- **ReDoc:** http://localhost:5173/api/redoc
- **OpenAPI JSON:** http://localhost:5173/api/openapi.json

Use the Swagger UI to try endpoints directly — paste an `Authorization: Bearer <token>` header from a `/api/auth/login` response and the rest of the surface becomes interactive.

### Running tests

```bash
# Backend (FastAPI + pytest, against an isolated jobportal_test database)
docker compose run --rm backend pytest

# Frontend (Vitest + Testing Library)
docker compose run --rm --entrypoint sh frontend -c "cd /app 2>/dev/null || true; npm test --silent"
```

For local frontend development without Docker, `cd frontend && npm install && npm test` works too.

---

## 4. Test credentials

| Role      | Email                  | Password         |
|-----------|------------------------|------------------|
| HR        | `hr@test.com`          | `Hr@1234`        |
| Candidate | `candidate@test.com`   | `Candidate@1234` |

The HR user owns five sample jobs and the candidate has two seeded applications on the pipeline, so both dashboards have something to look at on first login. Two additional demo candidates (`rohan.designer@test.com`, `sneha.engineer@test.com`, both `Test@1234`) populate the HR pipeline for filtering demos.

---

## 5. Feature walkthrough

### HR

| Feature                          | How to reach it                                              |
|----------------------------------|--------------------------------------------------------------|
| Dashboard (counts + funnel)      | Log in as HR → lands on `/hr`.                               |
| Post a new job                   | `/hr/jobs` → **+ Post a job**, or top-right shortcut.        |
| Edit / pause / close / delete    | `/hr/jobs` → per-row controls.                               |
| Review applicants                | Job row → **Applicants** opens `/hr/jobs/:id/applicants`.    |
| Pipeline filters                 | Left sidebar: skills (any/all), experience range, current/expected CTC ceiling, max notice, applied-date range, stage, keyword search across cover note and skills, plus four sort modes (recent, lowest expected CTC, shortest notice, most experienced). |
| Move candidate between stages    | Per-row stage dropdown on the applicants table. Each change is recorded with the time it happened and who made it. |
| Private internal notes           | **Notes** drawer on each applicant row. Candidates never see these notes (enforced both in the UI and the API). |

### Candidate

| Feature                          | How to reach it                                              |
|----------------------------------|--------------------------------------------------------------|
| Browse jobs                      | `/jobs` shows all *active* jobs; closed/paused jobs are hidden. |
| Filter & search                  | Left sidebar: keyword, department, location type, employment type, experience range, CTC range, skills (comma-separated). |
| Deadline countdown               | Every job card and the job detail page show a live *Closes in X days / Closes today / Closed* pill. |
| Bookmark a job                   | **☆ Save** on job card or detail page; full list at `/me/bookmarks`. |
| Apply to a job                   | Job detail page → **Apply now**. Form validates resume URL, captures cover note, current/expected CTC, notice period, years of experience, key skills. Duplicate applications are rejected at the API. |
| Track applications + timeline    | `/me/applications` — stage badge per application; click *Timeline* to see the full progression with timestamps. |
| Withdraw                         | `/me/applications` → row action; only available while in the *Applied* stage. |

---

## 6. Tech stack

**Backend**
- FastAPI 0.115, Uvicorn
- SQLAlchemy 2.0 ORM, psycopg 3 driver
- Pydantic v2 + pydantic-settings for request schemas and env config
- passlib + bcrypt for password hashing
- python-jose for JWT
- pytest + FastAPI TestClient for tests

**Frontend**
- React 18 + TypeScript + Vite 5
- React Router 6 for routing and role-aware guards
- react-hook-form + zod for typed form validation
- Tailwind CSS 3 for styling
- Vitest + Testing Library for unit/integration tests
- nginx (alpine) serving the production bundle with `/api/*` proxied to the backend

**Database / infra**
- PostgreSQL 16 (alpine) with a named Docker volume for persistence
- Docker Compose orchestrating all three services with healthchecks
- GitHub Actions CI runs the full backend test suite + frontend build on every push

---

## 7. Security notes

- Passwords are stored as bcrypt hashes; the configured cost factor matches passlib's `bcrypt__default_rounds`.
- JWTs are HS256, signed with `JWT_SECRET` from the environment, and expire after 30 minutes.
- Every non-auth endpoint requires a valid token; HR-only endpoints additionally enforce role + ownership (an HR user cannot edit or view applicants for another HR's job).
- All SQL goes through SQLAlchemy parameterised queries — no string interpolation.
- Input validation runs on both ends: Pydantic on the backend, zod on the frontend.
- `.env` is gitignored; only `.env.example` is committed.
- No secrets are echoed in responses (the `User` serialiser deliberately omits `password_hash`).

---

## 8. Accessibility

- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<aside>` separate the regions of every page.
- Every form input has an associated `<label htmlFor="…">`; error messages are wired up next to the field they describe.
- Icon-only controls (bookmark toggle, drawer close button) carry `aria-label`s with state-aware copy (*"Save job"* vs *"Remove bookmark"*).
- Focus rings are kept visible on all interactive elements (Tailwind's `focus:ring-2 focus:ring-brand-500`); the design palette is checked for WCAG AA contrast on the brand blue and rose error red.
- Tables include header cells (`<th>`) with implicit scope; long lists use `role="list"` semantics by default through native `<ul>`/`<li>` or `<tbody>` rows.
- Keyboard: every actionable control is a button or anchor; the SPA never relies on click-only divs.

---

## 9. Repository layout

```
skypoint-assessment/
├── docker-compose.yml          # 3-service orchestration
├── .env.example                # documented config; copy to .env
├── .github/workflows/ci.yml    # backend pytest + frontend test/build
├── README.md
├── LICENSE                     # MIT
├── backend/
│   ├── Dockerfile              # python:3.12-slim → bootstrap + uvicorn
│   ├── requirements.txt
│   ├── pytest.ini
│   └── app/
│       ├── main.py             # FastAPI app, CORS, router include, /api/docs
│       ├── config.py           # Pydantic settings
│       ├── db.py               # engine + session
│       ├── deps.py             # DI: current_user, require_role
│       ├── security.py         # bcrypt + JWT
│       ├── bootstrap.py        # wait-for-db + create_all + seed
│       ├── seed.py             # idempotent demo data
│       ├── models/             # SQLAlchemy ORM (users, jobs, applications, events, bookmarks)
│       ├── schemas/            # Pydantic in/out
│       ├── routers/            # auth, jobs, applications, bookmarks, dashboard
│       └── tests/              # pytest + conftest using a separate DB
└── frontend/
    ├── Dockerfile              # node:20 build → nginx:alpine serve
    ├── nginx.conf              # /api → backend:8000, SPA fallback
    ├── package.json
    ├── vitest.config.ts
    └── src/
        ├── main.tsx, App.tsx
        ├── api/                # typed fetch client + endpoint helpers
        ├── auth/               # AuthContext + ProtectedRoute (with role gate)
        ├── components/         # Layout, JobCard, StageBadge, DeadlinePill, ErrorBanner
        ├── lib/                # formatting helpers (+ Vitest tests)
        ├── pages/              # Login, Register, candidate/*, hr/*
        └── tests/              # Vitest + Testing Library
```

---

## 10. Standout features beyond the brief

These were added on top of the brief's checklist to make the app more memorable:

- **Application timeline.** Every stage transition is recorded as an immutable event row (`application_events`); candidates can expand any application on `/me/applications` to see the full progression with timestamps.
- **Live deadline countdown.** Job cards and the job detail page render *Closes in N days / Closes today / Closed* pills, colored by urgency, so candidates know at a glance how much time they have.
- **Interactive API docs at `/api/docs`.** The FastAPI Swagger UI is served through the same nginx proxy, so an assessor can poke at the API without needing curl.
- **CI on every push.** The GitHub Actions workflow runs `pytest` against a real Postgres service container and builds the production frontend bundle, so a broken commit shows up red before it hits `main`.
- **Frontend test suite (Vitest).** Closes the “at least basic unit or integration tests” bar on both ends of the stack, not just the backend.

---

## 11. Known limitations & future improvements

- **Schema bootstrap uses `Base.metadata.create_all`** rather than Alembic migrations. Adequate for a fresh-volume assessment; a real production deployment would add Alembic for ordered schema evolution.
- **Resume is a link, not a file upload.** Avoids object-storage / S3 setup. Candidates paste a URL (e.g. Google Drive, Dropbox, personal site).
- **JWT only — no refresh tokens.** A session lasts 30 minutes; afterwards the user logs in again. Sufficient for the demo, not for production UX.
- **No rate limiting / lockout** on the auth endpoints. Production would add nginx rate-limit zones or a per-IP throttle in FastAPI.
- **Single HR user** owns the seeded jobs. Multi-HR collaboration on the same job (shared pipelines) is not modelled; each job is owned by one HR.
- **Email verification, password reset, and account recovery** flows are intentionally out of scope.
- **No Redis caching layer.** The HR dashboard query is small enough at the seed scale to be sub-millisecond, but a production deployment with thousands of jobs would benefit from caching the aggregations.
- **No AI features.** A candidate-ranking model trained on past hires (or even a heuristic “fit score” combining skill overlap, experience match, and CTC fit) would be a natural next step.
- **CSV export** of the applicants table is on the roadmap (drag-and-drop into spreadsheets is what HR actually wants).
