"""S3-compatible object storage (MinIO in dev, real S3 in prod).

One client, one bucket, every resume upload/download goes through here.
The rest of the app never imports boto3 directly — that's the contract
that lets us swap MinIO for AWS S3 by changing only the endpoint + creds.

Why MinIO (and not just write to a local volume mount):
  - Same boto3 API as production S3, so the storage layer is genuinely
    deployment-agnostic.
  - Per-object access controls are a real concept (not just file perms).
  - Streamed responses are first-class — we can pipe a multi-MB resume
    through FastAPI without buffering the whole thing in RAM.

Behaviour notes:
  - `put_object` accepts bytes (we already buffered the upload for the
    text extractor); a future presign-PUT path would skip this and let
    the browser upload direct to MinIO.
  - `head_object` returns None instead of raising on missing keys — the
    caller decides whether 404 is fatal or recoverable.
  - All bucket-write paths are idempotent so we can re-run bootstrap.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Iterator

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, EndpointConnectionError

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class StoredObject:
    """Metadata returned by head_object — enough to drive the download
    endpoint's headers without re-fetching the body."""

    key: str
    size: int
    content_type: str | None
    filename: str | None  # original filename echoed from x-amz-meta-filename


class Storage:
    """Thin facade over a single boto3 S3 client + bucket.

    Instantiated once at process start; reused for every request. boto3
    clients are thread-safe (per AWS docs), so this is safe across the
    uvicorn worker pool.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.minio_bucket
        # `signature_version="s3v4"` and `path` addressing style are what
        # MinIO supports; the same client works against real S3 too.
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.minio_endpoint,
            aws_access_key_id=settings.minio_access_key.get_secret_value(),
            aws_secret_access_key=settings.minio_secret_key.get_secret_value(),
            region_name=settings.minio_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def wait_and_ensure_bucket(self, retries: int = 30, delay: float = 1.0) -> None:
        """Block until MinIO answers, then create the bucket if missing.

        Called from bootstrap so a fresh `docker compose up` doesn't race
        with MinIO's startup. Idempotent — a re-run on an existing bucket
        is a no-op.
        """
        last_err: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                self._client.head_bucket(Bucket=self._bucket)
                logger.info("MinIO bucket %r exists.", self._bucket)
                return
            except EndpointConnectionError as exc:
                last_err = exc
                logger.info(
                    "MinIO not ready (attempt %s/%s): %s", attempt, retries, exc
                )
                time.sleep(delay)
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in {"404", "NoSuchBucket", "NotFound"}:
                    self._client.create_bucket(Bucket=self._bucket)
                    logger.info("MinIO bucket %r created.", self._bucket)
                    return
                # Some non-404 ClientError that we can't recover from.
                raise
        raise RuntimeError(
            f"MinIO not reachable after {retries} attempts: {last_err}"
        )

    def put_object(
        self,
        *,
        key: str,
        body: bytes,
        content_type: str,
        filename: str,
    ) -> None:
        """Write `body` to `key`. Stores original filename as metadata so
        the download endpoint can echo it back in Content-Disposition."""
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            # Keys in user metadata are lowercased + prefixed by `x-amz-meta-`
            # over the wire. boto3 takes the un-prefixed dict.
            Metadata={"filename": filename},
        )

    def head_object(self, key: str) -> StoredObject | None:
        """Return metadata for `key`, or None if it doesn't exist.

        Callers use the None return for "resume key references a file
        that's gone" — surface a clean 404 rather than a 500.
        """
        try:
            resp = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return StoredObject(
            key=key,
            size=int(resp.get("ContentLength") or 0),
            content_type=resp.get("ContentType"),
            filename=(resp.get("Metadata") or {}).get("filename"),
        )

    def iter_object(self, key: str, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        """Yield `key`'s bytes in chunks. Used to stream downloads through
        FastAPI without buffering the full body in RAM."""
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        body = resp["Body"]
        try:
            while True:
                chunk = body.read(chunk_size)
                if not chunk:
                    return
                yield chunk
        finally:
            body.close()

    def delete_object(self, key: str) -> None:
        """Best-effort delete. Missing keys are not an error."""
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey"}:
                return
            raise


# Module-level singleton. Lazy so test code that swaps env doesn't get
# a client wired to the wrong endpoint.
_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage()
    return _storage


def reset_storage_for_tests() -> None:
    """Clear the singleton — used by the test suite's fixtures."""
    global _storage
    _storage = None
