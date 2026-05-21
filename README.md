# Skypoint Job Portal

A full-stack hiring portal built for the Skypoint Cloud Claude Code assessment. Two roles — **HR** (post jobs, manage the candidate pipeline) and **Candidate** (browse jobs, apply, track applications) — share one app, gated by JWT-based authentication and a role-aware UI.

[![CI](https://github.com/karu19961j/skypoint-assessment/actions/workflows/ci.yml/badge.svg)](https://github.com/karu19961j/skypoint-assessment/actions/workflows/ci.yml)

![HR Dashboard — stage volume strip + Top 5 jobs funnel](docs/screenshots/01-hr-dashboard.png)
<p align="center"><em>HR Dashboard — pipeline volume across all jobs + Top 5 jobs by application count, each row linking to the per-job applicants view.</em></p>

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
| **Cross-job candidate inbox**    | `Candidates` in the nav (`/hr/applicants`). One screen showing every applicant on every job the HR owns; per-stage counters, "Filter by job" dropdown, all the per-job filters, inline stage moves and notes drawer — answers "who applied this week across all my jobs". |
| Post a new job                   | `/hr/jobs` → **+ Post a job**, or top-right shortcut.        |
| Edit / pause / close / delete    | `/hr/jobs` → per-row controls.                               |
| Per-job applicants               | Job row → **Applicants** opens `/hr/jobs/:id/applicants`.    |
| Pipeline filters                 | Left sidebar: skills (any/all), experience range, current/expected CTC ceiling, max notice, applied-date range, stage, keyword search across cover note and skills, plus four sort modes (recent, lowest expected CTC, shortest notice, most experienced). |
| Move candidate between stages    | Per-row stage dropdown on either applicants table. Each change is recorded with the time it happened and who made it. |
| **AI fit ranking**               | **Rank by fit score** toggle on the per-job applicants page. Sorts candidates by a 0–100 score (skill overlap + experience fit + CTC alignment + notice bonus), highlights matched skills green, tooltip on the badge shows the breakdown. |
| **CSV export**                   | **⬇ Export CSV** button next to the rank toggle. Downloads the current filter set with the same anonymized columns the table shows. |
| Profile / notes drawer           | **View profile** on a row opens a focus-trapped drawer revealing name + email + resume + cover note + private HR notes + the stage timeline. |
| Private internal notes           | Inside the profile drawer. Candidates never see these notes (enforced both in the UI and the API). |

### Candidate

| Feature                          | How to reach it                                              |
|----------------------------------|--------------------------------------------------------------|
| Browse jobs                      | `/jobs` shows all *active* jobs; closed/paused jobs are hidden. |
| Filter & search                  | Left sidebar: keyword, department, location type, employment type, experience range, CTC range, skills (comma-separated). |
| Deadline countdown               | Every job card and the job detail page show a live *Closes in X days / Closes today / Closed* pill. |
| Bookmark a job                   | **☆ Save** on job card or detail page; full list at `/me/bookmarks`. |
| Apply to a job                   | Job detail page → **Apply now**. Form validates resume URL, captures cover note, current/expected CTC, notice period, years of experience, key skills. Duplicate applications are rejected at the API. |
| Track applications + timeline    | `/me/applications` — stage badge per application; click *Timeline* to see the full progression with timestamps, including remaining stages as greyed pending markers. |
| Withdraw                         | `/me/applications` → row action; only available while in the *Applied* stage. |
| **Profile + Recommended jobs**   | `/me/profile` — set your skills, experience, expected CTC, preferred location once. `/jobs` then offers a **Recommended** tab that ranks every active job against your profile with a match score on each card. |

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
- JWTs are HS256, signed with `JWT_SECRET` from the environment, and expire after 30 minutes. The app **refuses to boot** when `JWT_SECRET` is a known placeholder value (`change-me`, the comment-marker default, etc.) — set a real secret with `openssl rand -hex 32` before any non-local deployment.
- Tokens carry both `sub` (user id) and `role`; every authenticated request re-reads the DB user and verifies the token's `role` claim still matches the current account role, so a token issued before a future role demotion would be rejected.
- Every non-auth endpoint requires a valid token; HR-only endpoints additionally enforce role + ownership (an HR user cannot edit, view, or stage-move applications on another HR's job).
- **HR self-signup is disabled by default.** `POST /api/auth/register` only accepts the `candidate` role unless `ALLOW_HR_SELF_REGISTER=true` is set in the environment. The seeded HR user is the only HR account in the demo; in production this is where an invite/admin flow would plug in.
- The two unique constraints on `applications(job_id, candidate_id)` and `bookmarks(candidate_id, job_id)` are the source of truth for "no duplicates" — the routers handle the `IntegrityError` path explicitly so a race between two concurrent POSTs returns a clean 409 / 200 instead of a 500.
- All SQL goes through SQLAlchemy parameterised queries — no string interpolation.
- Input validation runs on both ends: Pydantic on the backend, zod on the frontend. The browser's stored token is wiped and the user redirected to `/login` whenever any authenticated request returns 401.
- CORS uses `allow_credentials=False` and explicit method/header allow-lists; auth is bearer-token only so credentials on the CORS preflight are unnecessary, and keeping them off avoids the CSRF-shaped footgun a future cookie session would inherit.
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

- **AI candidate ranking.** `GET /api/applications/by-job/{id}/ranked` scores every applicant against the job requirements on a pure-logic 0–100 scale: 50 pts skill overlap, 30 pts experience fit, 20 pts CTC alignment, +5 pts immediate-joiner bonus, with deterministic decay curves outside each band (see `backend/app/services/ranking.py`). The HR applicants table has a **Rank by fit score** toggle that switches to ranked-mode, surfaces a `XX/100` badge per row with a tooltip showing the full breakdown, and highlights matching skills in green. No LLM, no external API — fully testable.
- **Smart job recommendations for candidates.** Candidates save a profile (skills, experience, expected CTC, preferred location); the same scoring engine, mirrored, ranks every active job against that profile and adds a +10 location bonus when the preference matches. `GET /api/jobs/recommended`; the candidate **Browse** page has an "All jobs" / "Recommended" tab, and the Recommended view renders a fit-score badge on each job card.
- **Cross-job candidate inbox for HR.** `/hr/applicants` rolls up every applicant on every job the HR owns into one screen with per-stage counters that double as filter buttons, plus the full filter surface from the per-job view and a "Filter by job" dropdown. The backend endpoint (`GET /api/applications/all`) is HR-scoped at the SQL level via a subquery, so an HR can never see applications on jobs they don't own.
- **Anonymized applicant cards + Profile drawer.** The HR list views deliberately omit candidate name, email, and resume to keep the discovery step bias-free; identity reveals only when the recruiter clicks "View profile" and opens a focus-trapped, Escape-closeable drawer that shows name + email + resume + cover note + private notes + timeline in one place.
- **Application timeline with pending stages.** Every stage transition is recorded as an immutable event row (`application_events`); candidates can expand any application on `/me/applications` to see the full progression — completed stages with timestamps and remaining happy-path stages as greyed pending markers.
- **CSV export.** `GET /api/applications/by-job/{id}/export` streams a `text/csv` of the current filter set with the exact columns the table shows — no name/email — so HR can drag the file into a spreadsheet.
- **Live deadline countdown.** Job cards and the job detail page render *Closes in N days / Closes today / Closed* pills colored by urgency.
- **Soft delete for jobs.** "Delete" closes the job (status flips to Closed) instead of removing the row, so the application history and stage timeline stay intact and the candidate's *My Applications* page never breaks.
- **Interactive API docs at `/api/docs`.** Swagger UI served through the same nginx proxy.
- **CI on every push.** Backend pytest against a real Postgres service container, frontend Vitest + production build, full docker compose build — all in parallel.
- **Frontend test suite (Vitest)** covers format helpers, components, form validation, and the role-aware ProtectedRoute redirects.

---

## 11. Known limitations & future improvements

- **Schema bootstrap uses `Base.metadata.create_all`** rather than Alembic migrations. Adequate for a fresh-volume assessment; a real production deployment would add Alembic for ordered schema evolution.
- **Resume is a link, not a file upload.** Avoids object-storage / S3 setup. Candidates paste a URL (e.g. Google Drive, Dropbox, personal site).
- **JWT only — no refresh tokens.** A session lasts 30 minutes; afterwards the user logs in again. Sufficient for the demo, not for production UX.
- **No rate limiting / lockout** on the auth endpoints. Production would add nginx rate-limit zones or a per-IP throttle in FastAPI.
- **Single HR user** owns the seeded jobs. Multi-HR collaboration on the same job (shared pipelines) is not modelled; each job is owned by one HR.
- **Email verification, password reset, and account recovery** flows are intentionally out of scope.
- **No Redis caching layer.** The ranking / recommendation / dashboard queries are sub-millisecond at the seed scale, but a production deployment with thousands of jobs would benefit from caching them.
- **HR self-signup is enabled by default for the demo** (`ALLOW_HR_SELF_REGISTER=true` in `.env.example`). Production should flip this to `false` and provision HR via an admin/invite flow — the backend already enforces the gate either way.
- **Skills as a comma-separated text field** rather than a pill-style tag input. The data shape is the same (a string array on the wire), but the UX is simpler.
- **No drag-and-drop Kanban** for the pipeline. The stage dropdown moves a candidate just as quickly, keeps the layout responsive on mobile, and avoids a lot of focus-management work that drag-and-drop forces.
