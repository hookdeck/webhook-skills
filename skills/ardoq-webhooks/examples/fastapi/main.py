# Generated with: ardoq-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI(title="Ardoq Webhooks Example")

SIGNATURE_PREFIX = "sha256="
HEX_DIGEST_RE = re.compile(r"[0-9a-fA-F]{64}")
UNIX_SECONDS_RE = re.compile(r"[0-9]+")


def default_tolerance() -> int:
    """Staleness window in seconds; 0 (the default) disables the check.

    Ardoq's own examples reject deliveries older than 5 minutes, but Hookdeck
    retries and replays resend the ORIGINAL headers and timestamp (and Hookdeck
    applies no tolerance itself), so a fixed window would reject legitimate
    retries. Set ARDOQ_WEBHOOK_TOLERANCE_SECONDS to opt in. Read at call time so
    it can be changed without a restart in tests.
    """
    try:
        return int(os.environ.get("ARDOQ_WEBHOOK_TOLERANCE_SECONDS", "0") or "0")
    except ValueError:
        return 0


def verify_ardoq_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    secret: str | None,
    tolerance_seconds: int | None = None,
) -> bool:
    """Verify an Ardoq webhook signature.

    Ardoq sends ``X-Ardoq-Signature-256: sha256=<hex>`` and
    ``X-Ardoq-Timestamp: <unix seconds>``. The digest is
    HMAC-SHA256(secret, "<timestamp>.<raw body>"). The message is built as
    BYTES: the timestamp header exactly as received (latin-1), a literal ".",
    then the raw body bytes untouched.

    ``raw_body`` must be the RAW request bytes, never re-serialized JSON.
    """
    if not secret or not signature_header or not timestamp_header:
        return False
    if tolerance_seconds is None:
        tolerance_seconds = default_tolerance()

    # Accept the value with or without the "sha256=" prefix
    digest = signature_header.removeprefix(SIGNATURE_PREFIX)

    # Validate the format BEFORE decoding
    if not HEX_DIGEST_RE.fullmatch(digest):
        return False

    # Optional staleness check (not enabled by default, see above)
    if tolerance_seconds > 0:
        if not UNIX_SECONDS_RE.fullmatch(timestamp_header):
            return False
        if abs(time.time() - int(timestamp_header)) > tolerance_seconds:
            return False

    try:
        timestamp_bytes = timestamp_header.encode("latin-1")
    except UnicodeEncodeError:
        return False
    signed_content = b"".join([timestamp_bytes, b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()

    # Hex is case-insensitive, so decode to bytes and compare in constant time
    return hmac.compare_digest(bytes.fromhex(digest), expected)


def handle_ardoq_event(event: dict[str, Any]) -> str:
    """Dispatch a verified Ardoq event on ``resource-type``, then ``event-type``.

    Signed webhooks only deliver component, reference and tag changes. Ardoq's
    docs show ``create`` as an ``event-type``; log whatever else arrives rather
    than assuming a list. There are no deletion events.

    Returns what was handled, e.g. "tag:create" or "unhandled:<type>".
    """
    resource_type = event.get("resource-type")
    event_type = event.get("event-type")
    label = f"{resource_type}:{event_type}"
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    if resource_type == "component":
        print(f"Component {event.get('resource-id')} {event_type}")
        # TODO: sync the component into your CMDB / catalog
        return label

    if resource_type == "reference":
        print(f"Reference {event.get('resource-id')} {event_type}")
        # TODO: update dependency links between components
        return label

    if resource_type == "tag":
        print(f"Tag {data.get('name') or event.get('resource-id')} {event_type}")
        # TODO: re-classify the tagged components (data["components"])
        return label

    print(f"Unhandled Ardoq resource-type: {resource_type}")
    return f"unhandled:{resource_type}"


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: read the raw bytes and verify them before any parsing."""
    # CRITICAL: request.body() is the exact bytes Ardoq signed
    raw_body = await request.body()

    if not verify_ardoq_signature(
        raw_body,
        request.headers.get("x-ardoq-signature-256"),
        request.headers.get("x-ardoq-timestamp"),
        os.environ.get("ARDOQ_WEBHOOK_SECRET"),
    ):
        print("Ardoq signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    return raw_body


@app.post("/webhooks/ardoq", response_class=PlainTextResponse)
async def ardoq_webhook(raw_body: bytes = Depends(verified_body)) -> str:
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_ardoq_event(event)
    return "OK"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
