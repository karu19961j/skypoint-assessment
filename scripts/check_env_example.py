#!/usr/bin/env python3
"""Fail if `.env.example` drifts from what the app actually reads.

Three things can fall out of sync as the app evolves:

  1. A new setting added to `app/config.py` but never documented in
     `.env.example` → onboarding devs hit confusing boot failures.
  2. An env var referenced in `docker-compose.yml` (with `${VAR:?required}`
     syntax) but missing from `.env.example` → `docker compose up` fails
     on a fresh checkout.
  3. A stale entry in `.env.example` for a setting that was deleted →
     looks like documentation but doesn't do anything.

This script audits all three. Wired into CI (see ci.yml) so a PR that
forgets to update `.env.example` fails the build.

Run locally:
    python scripts/check_env_example.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_EXAMPLE = ROOT / ".env.example"
COMPOSE_FILE = ROOT / "docker-compose.yml"


def keys_in_env_file(path: Path) -> set[str]:
    out: set[str] = set()
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, _ = line.partition("=")
        key = key.strip()
        if key:
            out.add(key)
    return out


def keys_in_settings() -> set[str]:
    # Import lazily so the script can run without the backend installed
    # locally — CI installs requirements before invoking us.
    sys.path.insert(0, str(ROOT / "backend"))
    from app.config import Settings

    return {name.upper() for name in Settings.model_fields}


def keys_referenced_in_compose(path: Path) -> set[str]:
    text = path.read_text()
    # Matches ${VAR}, ${VAR:?...}, ${VAR:-...}, ${VAR-...}
    return set(re.findall(r"\$\{([A-Z_][A-Z0-9_]*)", text))


def main() -> int:
    in_example = keys_in_env_file(ENV_EXAMPLE)
    in_settings = keys_in_settings()
    in_compose = keys_referenced_in_compose(COMPOSE_FILE)

    # Env vars used by sibling services (postgres, minio) but not consumed
    # by the Python backend's pydantic Settings. Document them, but don't
    # expect them as Settings fields.
    sibling_keys = {
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
        "MINIO_ROOT_USER",
        "MINIO_ROOT_PASSWORD",
    }

    settings_or_siblings = in_settings | sibling_keys

    missing_in_example = (in_settings - in_example) | (
        in_compose - in_example - sibling_keys
    )
    stale_in_example = in_example - settings_or_siblings - in_compose

    problems: list[str] = []
    if missing_in_example:
        problems.append(
            "Missing from .env.example: " + ", ".join(sorted(missing_in_example))
        )
    if stale_in_example:
        problems.append(
            "In .env.example but not used anywhere: "
            + ", ".join(sorted(stale_in_example))
        )

    if problems:
        for p in problems:
            print(f"❌ {p}", file=sys.stderr)
        print(
            "\nFix by updating .env.example (and the corresponding "
            "Settings field / docker-compose reference).",
            file=sys.stderr,
        )
        return 1

    print(
        f"✅ .env.example documents all {len(in_settings)} Settings fields "
        f"+ {len(sibling_keys)} sibling-service vars (no drift)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
