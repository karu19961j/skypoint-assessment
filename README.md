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
 └──────────────────┘         └───────────────────┘         └────┬──────────────┘
        host :5173                                               │
                                          ┌────────────────┐     │
                                          │ postgres :5432 │◀────┤
                                          │ (pgdata vol)   │     │
                                          └────────────────┘     │
                                          ┌────────────────┐     │
                                          │ minio   :9000  │◀────┘
                                          │ (S3-compat,    │
                                          │  miniodata vol)│
                                          └────────────────┘
```

Four Docker services on a private bridge network:

| Service     | Image / build                          | Purpose                                                                                |
|-------------|----------------------------------------|----------------------------------------------------------------------------------------|
| `postgres`  | `postgres:16-alpine`                   | Persistent storage (named volume `pgdata`).                                            |
| `minio`     | `minio/minio:RELEASE.2024-11-07T…`     | S3-compatible object storage for resume files (named volume `miniodata`). Reached only by the backend over the docker network — no host port mapping. |
| `backend`   | `./backend` (FastAPI)                  | REST API at `/api/*`. Bootstraps schema + MinIO bucket + seed on startup. Internal-only (not exposed). |
| `frontend`  | `./frontend` (multi-stage)             | Vite builds the React app; nginx serves the static bundle and proxies `/api/*` to the backend service over the Docker network. |

Only the frontend is exposed to the host (port `5173 → 80`). All backend traffic — including from the browser — flows through nginx, so the browser only ever speaks to one origin. Resume uploads/downloads stream through FastAPI (backend ↔ MinIO over the docker network), which keeps MinIO off the browser CORS surface and makes the same boto3 code work against AWS S3 in production.

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

The backend waits for Postgres' health check, runs `Base.metadata.create_all` to set up the schema, idempotently seeds the demo data, and creates the MinIO resume bucket. The whole stack is ready when you see `Application startup complete.` in the backend logs.

> The committed `.env.example` ships with demo-only secrets that boot the stack out of the box. Comments in the file flag every value that should be rotated for any non-local deployment — see §7 *Configuration & Secrets* for the local / CI / prod tier story.

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

#### Endpoint catalogue

| Method   | Path                                       | Role        | Purpose                                                                 |
|----------|--------------------------------------------|-------------|-------------------------------------------------------------------------|
| `POST`   | `/api/auth/register`                       | public      | Candidate signup (HR is gated by `ALLOW_HR_SELF_REGISTER`).             |
| `POST`   | `/api/auth/login`                          | public      | Issue a 30-min JWT.                                                     |
| `GET`    | `/api/auth/me`                             | any         | Current user.                                                           |
| `GET`    | `/api/health`                              | public      | `{ api, db, cache }` probe.                                             |
| `GET`    | `/api/jobs/`                               | any         | List jobs (filters + sort + paginated).                                 |
| `POST`   | `/api/jobs/`                               | HR          | Create a job.                                                           |
| `GET`    | `/api/jobs/recommended`                    | candidate   | Profile-scored job recommendations (404 if no profile).                 |
| `GET`    | `/api/jobs/{id}`                           | any         | One job (candidates only see active).                                   |
| `PATCH`  | `/api/jobs/{id}`                           | HR (owner)  | Update job fields (not status).                                         |
| `PATCH`  | `/api/jobs/{id}/status`                    | HR (owner)  | Active / Paused / Closed.                                               |
| `POST`   | `/api/jobs/{id}/close`                     | HR (owner)  | Soft delete — flips status to Closed, preserves applications.           |
| `GET`    | `/api/applications/mine`                   | candidate   | Candidate's own applications.                                           |
| `POST`   | `/api/applications/`                       | candidate   | Apply to a job. Payload is just `{job_id, cover_note}` — every other field is snapshotted from the candidate's profile. |
| `POST`   | `/api/resume/upload`                       | candidate   | Multipart upload (PDF/DOC/DOCX, 15 MB max). Returns storage key the candidate then submits via `PUT /api/profile`. |
| `GET`    | `/api/profile/resume`                      | candidate   | Stream the candidate's own profile resume back, `Content-Disposition: inline` so PDFs preview in a new tab. |
| `GET`    | `/api/resume/{application_id}/download`    | owner       | Stream a per-application resume snapshot, owner-checked (candidate or the HR who owns the job). |
| `DELETE` | `/api/applications/{id}`                   | candidate   | Withdraw (Applied stage only).                                          |
| `GET`    | `/api/applications/{id}`                   | owner       | Full detail **including identity** — drives the Profile drawer.         |
| `PATCH`  | `/api/applications/{id}/stage`             | HR (owner)  | Move between stages. Terminal stages lock further transitions.          |
| `GET`    | `/api/applications/{id}/timeline`          | owner       | Immutable stage event history.                                          |
| `GET`    | `/api/applications/{id}/notes`             | HR (owner)  | List private notes.                                                     |
| `POST`   | `/api/applications/{id}/notes`             | HR (owner)  | Add a private note.                                                     |
| `GET`    | `/api/applications/by-job/{id}`            | HR (owner)  | Applicants for one job (anonymized).                                    |
| `GET`    | `/api/applications/by-job/{id}/ranked`     | HR (owner)  | Applicants scored + sorted by fit (anonymized).                         |
| `GET`    | `/api/applications/by-job/{id}/export`     | HR (owner)  | CSV download of the filtered set (anonymized).                          |
| `GET`    | `/api/applications/all`                    | HR          | Cross-job applicant feed scoped to the HR's own jobs.                   |
| `GET`    | `/api/bookmarks/`                          | candidate   | Saved jobs.                                                             |
| `POST`   | `/api/bookmarks/`                          | candidate   | Bookmark a job (idempotent, 200 on repeat).                             |
| `DELETE` | `/api/bookmarks/{job_id}`                  | candidate   | Remove a bookmark.                                                      |
| `GET`    | `/api/profile/`                            | candidate   | Current profile (null if not set). Includes skills, fresher flag, CTCs, notice, preferred locations, prior experience rows, education rows, resume metadata. |
| `PUT`    | `/api/profile/`                            | candidate   | Create or update the profile. Experiences + educations replaced wholesale on each save. |
| `DELETE` | `/api/profile/`                            | candidate   | Clear the saved profile.                                                |
| `GET`    | `/api/dashboard/hr`                        | HR          | Stats + top-5 jobs funnel.                                              |

### Running tests

```bash
# Backend (FastAPI + pytest, against an isolated jobportal_test database)
docker compose run --rm backend pytest

# Frontend (Vitest + Testing Library)
docker compose run --rm --entrypoint sh frontend -c "cd /app 2>/dev/null || true; npm test --silent"
```

For local frontend development without Docker, `cd frontend && npm install && npm test` works too.

---

## 4. Demo credentials (assessment only)

> ⚠️ These accounts ship pre-seeded in the demo container for the assessor's convenience. They are intentionally weak — do **not** copy these passwords into a production deployment.

| Role      | Email                  | Password         |
|-----------|------------------------|------------------|
| HR        | `hr@test.com`          | `Hr@1234`        |
| Candidate | `candidate@test.com`   | `Candidate@1234` |

The seed populates the demo with realistic volume on first boot: the HR user owns **~25 jobs across ten departments**, the primary candidate gets a populated profile (skills, YOE, CTC, prior experience, education — no resume on file so the assessor exercises the "upload your CV on your profile" gate when they apply) plus two seeded applications, and a pool of **20 additional demo candidates** (shared password `Test@1234`) each get their own profile and fill the HR pipeline with **~200 applications** distributed across the six stages. Every application carries a `profile_snapshot` JSONB column so HR sees the candidate's full history at apply time even if the candidate edits their profile later. That's enough data to exercise infinite scroll on the candidate browse, every applicant filter, the HR funnel cards, ranking, the cross-job inbox, and the top-5 dashboard table without manually creating anything.

Seed is deterministic (`random.seed(42)`) so the demo dataset is identical on every fresh boot. To reset to the freshly-seeded state after you've been clicking around, run `docker compose down -v && docker compose up --build` — the `-v` drops the postgres + minio volumes so the bootstrap re-runs from scratch. **You also need to do this after pulling a schema change** — `create_all` adds new tables / columns idempotently, but doesn't ALTER existing rows; a fresh volume picks up the latest schema cleanly.

**HR self-registration is disabled by default** (`ALLOW_HR_SELF_REGISTER=false`); the public `/register` form only accepts candidates. HR accounts ship via the seed.

---

## 5. Feature walkthrough

### HR

| Feature                          | How to reach it                                              |
|----------------------------------|--------------------------------------------------------------|
| Dashboard (counts + funnel)      | Log in as HR → lands on `/hr`. Aggregated pipeline volume + Top 5 jobs by applications. |
| **Cross-job candidate inbox**    | `Candidates` in the nav (`/hr/applicants`). One screen showing every applicant on every job the HR owns; per-stage counters, "Filter by job" dropdown, all the per-job filters, inline stage moves and notes drawer. |
| Post a new job                   | `/hr/jobs` → **+ Post a job**, or top-right shortcut.        |
| Edit / pause / close / duplicate | `/hr/jobs` → per-row controls. `⧉ Duplicate` creates a Paused copy with " (copy)" appended; `Close` is a soft delete (status → Closed) so application history survives. |
| Per-job applicants               | Job row → **Applicants** opens `/hr/jobs/:id/applicants`.    |
| Pipeline filters                 | Left sidebar: skills (any/all), experience range, current/expected CTC ceiling **(typed in LPA — `12`, not `1200000`)**, max notice (discrete buckets: Immediate / 15 / 30 / 60 / 90), applied-date range, stage, keyword search across cover note, skills, **and the candidate's resume text**, plus four sort modes (recent, lowest expected CTC, shortest notice, most experienced). Text + numeric filters are **debounced 400ms** so typing a long term doesn't fire a fetch per keystroke. |
| Move candidate between stages    | Per-row stage dropdown on either applicants table. Each change is recorded with the time it happened and who made it. Terminal stages (Hired / Rejected) lock further transitions. Stage moves are toasted on success/failure (sonner) so HR sees confirmation without an inline banner. |
| **AI fit ranking**               | **Rank by fit score** toggle on the per-job applicants page. Sorts by a 0–100 score (skill overlap + experience fit + CTC alignment + notice bonus); the colour-coded badge has a hover/focus popover (rendered via React portal so the breakdown never gets clipped by the table) with matched skills highlighted green. |
| **CSV export**                   | **⬇ Export CSV** button next to the rank toggle. Streams the current filter set with the same anonymized columns the table shows. |
| Profile / notes drawer           | **View profile** on a row opens a focus-trapped drawer that fetches the full identity (name + email + cover note + resume metadata + the candidate's profile snapshot) only on demand — the list response is anonymized. Notes + stage timeline live in the same drawer. |
| **Candidate history in drawer**  | Drawer renders the candidate's prior experience (role + company + date range, "currently working here" → present) and education (degree, field, institution, year range) from the application's `profile_snapshot` JSON column. Includes a 'Fresher' chip when the candidate's profile is flagged as no prior work experience. |
| **Resume download**              | Inside the profile drawer: **⬇ Download resume** streams the file from MinIO through the backend (no host port mapping, single origin) with the original filename echoed back in `Content-Disposition`. Drawer shows filename + size; "No resume on file" for applications without one (referral-style or seed). |
| Private internal notes           | Inside the profile drawer. Candidates never see these notes (enforced both in the UI and the API). |

### Candidate

| Feature                          | How to reach it                                              |
|----------------------------------|--------------------------------------------------------------|
| Browse jobs                      | `/jobs` shows all *active* jobs; closed/paused jobs are hidden. |
| Filter & search                  | Left sidebar: keyword, department, location type, employment type, experience range, **CTC range in LPA** (type `12` for 12 LPA — converted to raw rupees at the API boundary), skills (comma-separated). Inputs are **debounced 400ms** before they hit the query. |
| Deadline countdown               | Every job card and the job detail page show a live *Closes in X days / Closes today / Closed* pill. |
| Bookmark a job                   | **☆ Save** on job card or detail page; full list at `/me/bookmarks`. |
| **Profile (the source of truth)** | `/me/profile` is where the candidate enters everything once: resume (PDF/DOC/DOCX, 15 MB), skills, total YOE, current/expected CTC **(typed in LPA)**, notice period, preferred locations, prior experience (dynamic rows: company, role, dates, "currently working here" toggle), education (institution, degree, field, year range). A **fresher checkbox** zeroes out the work-experience fields + hides the Prior Experience section in one click. The resume gets a **View** button (opens the PDF inline in a new tab via authenticated blob fetch) and a Remove button. |
| Apply to a job                   | Job detail → **Apply now** → modal asks only for an optional cover note. Backend snapshots everything else from the profile at submit time and embeds the experience + education list as JSONB on the application row, so HR sees the candidate's full picture and the history stays consistent if the candidate edits their profile later. If the profile is missing or has no resume, the modal shows an amber CTA pointing at `/me/profile`. Duplicate applications + past-deadline applications are rejected at the API. |
| Track applications + timeline    | `/me/applications` — stage badge per application; click *Timeline* to see the full progression with timestamps, including remaining stages as greyed pending markers. Sort by recently applied / recently updated. |
| Withdraw                         | `/me/applications` → row action; only available while in the *Applied* stage. Confirmation toast on success. |
| **Recommended jobs**             | `/jobs?tab=recommended` ranks every active job against the profile. Pre-filter is profile-aware: fresher candidates only see roles with `exp_min ≤ 2` (no senior roles); non-fresher candidates don't see jobs whose ceiling is below 80 % of their current CTC. Match-% badge on each card with matched skills highlighted in green. |
| Infinite scroll                  | `/jobs` (All-jobs tab) auto-loads the next batch of 12 jobs as you scroll near the bottom (IntersectionObserver); explicit `Load more` is the keyboard fallback. Backed by `useInfiniteQuery` so tab-switching back to a previously-loaded filter set is instant. |

---

## 6. Tech stack

**Backend**
- FastAPI 0.115, Uvicorn
- SQLAlchemy 2.0 ORM, psycopg 3 driver
- Pydantic v2 + pydantic-settings for request schemas and env config
- passlib + bcrypt for password hashing
- python-jose for JWT
- boto3 for S3-compatible object storage (MinIO in dev, real S3 in prod)
- pypdf + python-docx for resume text extraction
- python-multipart for streamed file uploads
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
- MinIO (S3-compatible object storage) with its own named Docker volume for resume binaries
- Docker Compose orchestrating all four services with healthchecks
- GitHub Actions CI runs the full backend test suite + frontend build on every push

---

## 7. Configuration & Secrets

Configuration follows a three-tier model. The application code is **source-agnostic** — it reads from the process environment via `pydantic-settings` and doesn't care who put the values there.

| Tier        | Source                                                                                  | What's in scope                                                                |
|-------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| **Local**   | A developer's `.env` (gitignored). `.env.example` ships demo-only secrets that boot the stack out of the box; comments flag what to rotate before non-local use. | `JWT_SECRET=local-demo-…`, `POSTGRES_PASSWORD=jobportal_demo_password`, `MINIO_ROOT_PASSWORD=minio_demo_password`, the seeded demo passwords, Docker-network URLs. |
| **CI**      | GitHub Actions secrets, injected as env vars by the workflow.                            | A real `JWT_SECRET` per branch; `pytest` against a Postgres service container. |
| **Prod**    | A real secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager).                 | Rotated `JWT_SECRET`, DB credentials, etc.                                     |

Swapping tier 1 for tier 3 changes the deployment manifest, never the application code.

Guard rails:

- **`backend/app/config.py`** — every secret field is typed as `SecretStr` so the value never appears in repr/logs by accident. `extra="forbid"` rejects misspelled env vars (`JWT_EXPIRY_MINUTES` would otherwise silently fall back to the default). `app_env: Literal["development", "test", "production"]` and bounded validators (`jwt_expires_minutes: Field(ge=1, le=1440)`) keep ops from setting a 100-year JWT TTL. `assert_production_ready()` refuses to boot when the JWT secret looks like a placeholder; in `production` mode it additionally enforces a 32-char minimum.
- **`docker-compose.yml`** — every required env var uses the `${VAR:?required}` form. `docker compose up` fails with a clear message instead of silently passing through an empty value.
- **`scripts/check_env_example.py`** — fails CI if `.env.example` has drifted from `app/config.py`'s Settings or from the env vars referenced in `docker-compose.yml`. Run locally with `python scripts/check_env_example.py`.
- **`.pre-commit-config.yaml`** — gitleaks scans every commit for accidentally-staged credentials; the same env-drift script also runs as a hook. Install with `pre-commit install` after cloning.
- **`frontend/src/env.ts`** — `import.meta.env` is parsed through a zod schema at build time. A missing/mistyped `VITE_*` value blows up the build with a clear error instead of landing in the bundle as `undefined`.

> **After pulling a schema change** — bootstrap uses `Base.metadata.create_all`, which adds tables + columns but never alters existing ones. Run `docker compose down -v && docker compose up --build` to drop the postgres + minio volumes and re-seed from scratch. Documented as the demo workflow in §3; production deployments would swap in Alembic.

## 8. Security notes

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

## 9. Accessibility

- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<aside>` separate the regions of every page.
- Every form input has an associated `<label htmlFor="…">`; error messages are wired up next to the field they describe.
- Icon-only controls (bookmark toggle, drawer close button) carry `aria-label`s with state-aware copy (*"Save job"* vs *"Remove bookmark"*).
- Focus rings are kept visible on all interactive elements (Tailwind's `focus:ring-2 focus:ring-brand-500`); the design palette is checked for WCAG AA contrast on the brand blue and rose error red.
- Tables include header cells (`<th>`) with implicit scope; long lists use `role="list"` semantics by default through native `<ul>`/`<li>` or `<tbody>` rows.
- Keyboard: every actionable control is a button or anchor; the SPA never relies on click-only divs.

---

## 10. Repository layout

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

## 11. Standout features beyond the brief

These were added on top of the brief's checklist to make the app more memorable:

- **Profile is the single source of truth, applying is one click.** The candidate fills `/me/profile` once with skills, fresher flag, total YOE, current/expected CTC, notice period, preferred locations, prior experience rows (company, role, dates, "currently working here"), education rows (institution, degree, field, years), and their resume. The Apply form on a job detail page asks only for an optional cover note — the backend snapshots every other field from the profile at submit time and embeds the experience + education list as a `profile_snapshot` JSONB column on the application row. HR sees the full picture in the drawer, and historical applications stay consistent even if the candidate edits their profile later.
- **Resume upload to S3-compatible storage with inline preview.** Resume lives on the profile (PDF / DOC / DOCX, 15 MB cap). The upload streams through FastAPI into MinIO (same boto3 calls work against AWS S3 in prod, only the endpoint changes — see `backend/app/services/storage.py`); the backend extracts text (pypdf for PDF, python-docx for DOCX) and stashes it on the profile + on every application snapshot so HR keyword search hits cover note + skill tags **and** resume body. The profile page surfaces a **View** button that fetches the blob with the bearer header and opens the PDF inline in a new tab via objectURL — no token-in-querystring leak, no MinIO origin exposed to the browser. HR download in the drawer streams the per-application snapshot with `Content-Disposition: attachment`.
- **Profile-aware job recommendations.** Pre-filter respects the fresher flag (`is_fresher=True` candidates only see roles with `exp_min ≤ 2` — no senior-engineer noise) and adds a substantial-paycut guard for non-fresher candidates (jobs whose ceiling is below 80 % of current CTC are filtered out before scoring). Same scoring engine as HR ranking, mirrored.
- **AI candidate ranking.** `GET /api/applications/by-job/{id}/ranked` scores every applicant against the job requirements on a pure-logic 0–100 scale: 50 pts skill overlap, 30 pts experience fit, 20 pts CTC alignment, +5 pts immediate-joiner bonus, with deterministic decay curves outside each band (see `backend/app/services/ranking.py`). The HR applicants table has a **Rank by fit score** toggle that switches to ranked-mode, surfaces a `XX/100` badge per row with a tooltip showing the full breakdown, and highlights matching skills in green. No LLM, no external API — fully testable.
- **Cross-job candidate inbox for HR.** `/hr/applicants` rolls up every applicant on every job the HR owns into one screen with per-stage counters that double as filter buttons, plus the full filter surface from the per-job view and a "Filter by job" dropdown. The backend endpoint (`GET /api/applications/all`) is HR-scoped at the SQL level via a subquery, so an HR can never see applications on jobs they don't own.
- **Anonymized applicant cards + Profile drawer with full history.** The HR list views deliberately omit candidate name, email, resume metadata, AND the experience + education snapshot to keep the discovery step bias-free; identity reveals only when the recruiter clicks "View profile" and opens a focus-trapped, Escape-closeable drawer that shows name + email + resume + cover note + prior experience (role + company + date range, "currently working here" → present) + education (degree, field, institution, year range) + a Fresher chip when applicable + private notes + timeline in one place.
- **Application timeline with pending stages.** Every stage transition is recorded as an immutable event row (`application_events`); candidates can expand any application on `/me/applications` to see the full progression — completed stages with timestamps and remaining happy-path stages as greyed pending markers.
- **CSV export.** `GET /api/applications/by-job/{id}/export` streams a `text/csv` of the current filter set with the exact columns the table shows — no name/email — so HR can drag the file into a spreadsheet.
- **Live deadline countdown.** Job cards and the job detail page render *Closes in N days / Closes today / Closed* pills colored by urgency.
- **Soft delete for jobs.** "Delete" closes the job (status flips to Closed) instead of removing the row, so the application history and stage timeline stay intact and the candidate's *My Applications* page never breaks.
- **Interactive API docs at `/api/docs`.** Swagger UI served through the same nginx proxy.
- **CI on every push.** Backend pytest against a real Postgres service container, frontend Vitest + production build, full docker compose build — all in parallel.
- **Frontend test suite (Vitest)** covers format helpers, components, form validation, the role-aware ProtectedRoute redirects, and the `<Pagination>` component (range clamping, disabled-at-ends, aria-current, long-list ellipses).
- **CTC inputs accept LPA, not raw rupees.** Every CTC field across the app (candidate browse filter, profile, HR job form, HR applicant filter) accepts numeric LPA (`12`, `21.5`); the backend still stores raw rupees, but `lpaToRupees` converts at the form boundary. Type-`1200000`-to-mean-12-lakhs is the kind of UX paper-cut nobody fixes — fixing it is the difference between "demo" and "thoughtfully built".
- **Debounced filter inputs.** The four pages that drive a React Query queryKey from text/numeric inputs (`/jobs`, `/me/applications`, `/hr/jobs/:id/applicants`, `/hr/applicants`) wrap their filter state in a `useDebouncedValue` hook (400ms). Controlled inputs stay snappy; the API call lags at human-typing cadence rather than per-keystroke. The page-reset effect on HR applicant pages also keys off the debounced shape so the user doesn't bounce back to page 1 mid-typing.

---

## 12. Known limitations & future improvements

- **Schema bootstrap uses `Base.metadata.create_all`** rather than Alembic migrations. Adequate for a fresh-volume assessment; a real production deployment would add Alembic for ordered schema evolution.
- **Legacy `.doc` resumes upload + download but skip text extraction.** Binary `.doc` parsing needs heavyweight system deps (antiword/textract); we accept the format so a candidate with an older Word file isn't blocked, but those uploads won't surface in HR keyword search. `.pdf` and `.docx` get the full pipeline.
- **Resume autofill is intentionally not exposed.** The text extractor still runs on upload to feed keyword search, but the candidate fills the profile manually. Earlier iterations of the form pre-filled skills from the resume — we pulled it because the profile is the canonical source now and surfacing guesses next to the user's own input was more confusing than helpful.
- **JWT only — no refresh tokens.** A session lasts 30 minutes; afterwards the user logs in again. Sufficient for the demo, not for production UX.
- **No rate limiting / lockout** on the auth endpoints. Production would add nginx rate-limit zones or a per-IP throttle in FastAPI.
- **Single HR user** owns the seeded jobs. Multi-HR collaboration on the same job (shared pipelines) is not modelled; each job is owned by one HR.
- **Email verification, password reset, and account recovery** flows are intentionally out of scope.
- **No Redis caching layer.** The ranking / recommendation / dashboard queries are sub-millisecond at the seed scale, but a production deployment with thousands of jobs would benefit from caching them.
- **HR self-signup is disabled by default** (`ALLOW_HR_SELF_REGISTER=false` in `.env.example`). The seeded HR account is the only path in for the demo; flip the flag to `true` only if you want the public `/register` form to accept HR signups too. Production would gate this behind an admin/invite flow regardless — the backend enforces it either way.
- **Skills as a comma-separated text field** rather than a pill-style tag input. The data shape is the same (a string array on the wire), but the UX is simpler.
- **No drag-and-drop Kanban** for the pipeline. The stage dropdown moves a candidate just as quickly, keeps the layout responsive on mobile, and avoids a lot of focus-management work that drag-and-drop forces.
