# Generated with: didit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# X-Timestamp window, off by default (0). Didit recommends 300 seconds, but a gateway such as
# Hookdeck re-sends retries and replays with the original X-Timestamp, so a default window
# would reject them. Set DIDIT_TIMESTAMP_TOLERANCE_SECONDS to a positive value to opt in.
DEFAULT_TOLERANCE_SECONDS = 0
_warned_invalid_tolerance = False


def verify_didit_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """Verify a Didit webhook. Returns (valid, error).

    X-Signature = hex HMAC-SHA256 of the exact raw request body, keyed with the
    destination's secret_shared_key (raw string). X-Timestamp (unix seconds) is a
    separate header and is NOT part of the signed input; Didit's docs say to
    reject anything older than 300 seconds. That check is opt-in here: tolerance_seconds=0
    (the default) disables it.
    """
    if not signature:
        return False, "Missing X-Signature header"
    if not secret:
        return False, "Missing webhook secret"

    if tolerance_seconds > 0:
        try:
            ts = int(timestamp or "")
        except ValueError:
            return False, "Missing or invalid X-Timestamp header"
        current = time.time() if now is None else now
        if abs(current - ts) > tolerance_seconds:
            return False, "Timestamp outside tolerance window"

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8")):
        return False, "Invalid signature"
    return True, None


def tolerance_from_env() -> int:
    """A value that isn't a whole number of seconds is treated as 0 (check off), with a warning."""
    global _warned_invalid_tolerance
    raw = (os.getenv("DIDIT_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_TOLERANCE_SECONDS
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "DIDIT_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


tolerance_from_env()  # surface an invalid value at startup


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: verify X-Signature over the raw body, return the bytes."""
    secret = os.getenv("DIDIT_WEBHOOK_SECRET")
    if not secret:
        print("DIDIT_WEBHOOK_SECRET is not set - refusing unauthenticated webhooks")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # IMPORTANT: use the raw bytes. X-Signature covers exactly what Didit sent.
    raw_body = await request.body()
    valid, error = verify_didit_signature(
        raw_body,
        request.headers.get("x-signature"),
        request.headers.get("x-timestamp"),
        secret,
        tolerance_from_env(),
    )
    if not valid:
        print(f"Didit webhook rejected: {error}")
        raise HTTPException(status_code=400, detail=error)
    return raw_body


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/didit")
async def didit_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # event_id is stable across retries and fan-out: use it as the idempotency key.
    # TODO: skip if event["event_id"] was already processed.
    webhook_type = event.get("webhook_type")
    print(f"Verified Didit webhook: {webhook_type} ({event.get('event_id')})")

    if webhook_type == "status.updated":
        # Session status changed. status is e.g. "Approved", "Declined", "In Review",
        # "Abandoned", "Resubmitted". decision is present for the first four.
        # KYB payloads add session_kind: "business" and business_session_id.
        vendor_data = event.get("vendor_data")
        suffix = f" (vendor_data: {vendor_data})" if vendor_data else ""
        print(f"Session {event.get('session_id')} is now {event.get('status')}{suffix}")
    elif webhook_type == "data.updated":
        # Verification data was edited after creation (e.g. manual reviewer correction).
        # trigger may be "manual_review", "manual_step_update" or "ongoing_monitoring".
        print(f"Session {event.get('session_id')} data updated (trigger: {event.get('trigger') or 'n/a'})")
    else:
        # Other subscribable events: user.status.updated, transaction.created, etc.
        print(f"Unhandled Didit event: {webhook_type}")

    # Respond 2xx quickly; Didit times out after 5 seconds and retries 5xx/404.
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
