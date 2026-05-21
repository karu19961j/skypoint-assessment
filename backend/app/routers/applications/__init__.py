"""`/api/applications/*` routes, split across three sub-modules.

Order of inclusion is load-bearing: FastAPI matches routes in the order
they're registered. `discovery` declares the literal `/by-job/...` and
`/all` paths; `export` declares the literal `/by-job/{id}/export`;
`lifecycle` declares the catch-all `/{application_id}` parameter route.
Including discovery + export before lifecycle keeps the literal paths
ahead of the parameter, so a request for `/all` doesn't get routed into
`/{application_id}` with `application_id="all"` (which would 422).
"""

from fastapi import APIRouter

from . import discovery, export, lifecycle

router = APIRouter()
router.include_router(discovery.router)
router.include_router(export.router)
router.include_router(lifecycle.router)
