"""Idempotent startup: create tables, then seed test data.

Run as a module before launching uvicorn:
    python -m app.bootstrap && uvicorn app.main:app
"""

import logging
import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config import get_settings
from app.db import engine
from app.models import Base
from app.seed import run_seed

logger = logging.getLogger(__name__)


def wait_for_db(retries: int = 30, delay: float = 1.0) -> None:
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as exc:
            last_err = exc
            logger.info("DB not ready (attempt %s/%s): %s", attempt, retries, exc)
            time.sleep(delay)
    raise RuntimeError(f"Database not reachable after {retries} attempts: {last_err}")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    get_settings().assert_production_ready()
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    run_seed()
    logger.info("Bootstrap complete.")


if __name__ == "__main__":
    main()
