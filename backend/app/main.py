import logging
import uuid

from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.db import engine
from app.routers import applications, auth, bookmarks, dashboard, jobs, profile, resume

logger = logging.getLogger("app")


class _SuppressHealthLogs(logging.Filter):
    """Drop `/api/health` lines from uvicorn's access log.

    Docker's HEALTHCHECK polls the endpoint every 30s; without this filter
    those probes dominate the steady-state log stream and bury anything
    meaningful (a developer tailing `docker compose logs backend` would
    have to scroll past dozens of `200 OK /api/health` lines for every
    real request).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/health" not in record.getMessage()


# Tighten the default log format so every line carries level+logger name;
# uvicorn's own formatters are kept for access logs (we just filter them).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s :: %(message)s",
)
logging.getLogger("uvicorn.access").addFilter(_SuppressHealthLogs())
# boto3 + botocore are extremely chatty at INFO ("Found credentials in…"
# on every request); raise their floor so the real app's INFO lines
# aren't drowned out.
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("s3transfer").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

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
    # Non-standard response headers aren't readable by JS in cross-origin
    # responses unless explicitly exposed. `X-Total-Count` drives the
    # frontend's pagination footer; same-origin (nginx proxy) doesn't
    # need this but the Vite dev server (5173 → 8000) does.
    expose_headers=["X-Total-Count"],
)


# ---------- exception handlers ----------
#
# Two guardrails so the API never leaks a raw stack trace and the UI
# always has a `{"detail": "<sentence>"}` shape to render.
#
# 1. Storage / network errors get translated to 503 with a clear message.
# 2. Anything else unhandled becomes a 500 with a short reference id —
#    operators grep the id in the backend logs to find the full trace.


@app.exception_handler(EndpointConnectionError)
async def storage_unreachable(_request: Request, exc: EndpointConnectionError):
    logger.error("Object storage unreachable: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Storage backend is temporarily unavailable. Please try again."},
    )


@app.exception_handler(ClientError)
async def storage_client_error(_request: Request, exc: ClientError):
    code = exc.response.get("Error", {}).get("Code", "Unknown")
    logger.error("Object storage error %s: %s", code, exc)
    return JSONResponse(
        status_code=502,
        content={"detail": "Storage backend returned an error. Please try again."},
    )


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    ref = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled exception ref=%s method=%s path=%s", ref, request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"An unexpected error occurred (ref {ref})."},
    )


# ---------- routers ----------

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["applications"])
app.include_router(bookmarks.router, prefix="/api/bookmarks", tags=["bookmarks"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(resume.router, prefix="/api/resume", tags=["resume"])


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
