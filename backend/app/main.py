from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.db import engine
from app.routers import applications, auth, bookmarks, dashboard, jobs, profile

settings = get_settings()

app = FastAPI(
    title="Skypoint Job Portal API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Auth uses `Authorization: Bearer …` headers (no cookies), so credentials
    # are not needed on cross-origin requests. Keeping this False also avoids
    # the CSRF-shaped footgun a future cookie-based session would inherit.
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["applications"])
app.include_router(bookmarks.router, prefix="/api/bookmarks", tags=["bookmarks"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Service health probe.

    Returns the status of each component the API depends on. `cache` is
    intentionally reported as "disabled" — the demo runs without Redis;
    a production deployment would replace this with a real PING check.
    """
    db_status = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        db_status = "down"

    return {
        "api": "ok",
        "db": db_status,
        "cache": "disabled",
    }
