# Generated with: magic-hour-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_list(value):
    """A nested JSON array, or [] when the field is missing or another type."""
    return value if isinstance(value, list) else []


load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_magic_hour_signature(
    raw_body: bytes,
    headers,
    secret: Optional[str] = None,
    tolerance_seconds: Optional[int] = None,
) -> Optional[str]:
    """Verify a Magic Hour webhook. Returns None when valid, else an error string.

    signature = lowercase hex HMAC-SHA256(secret, f"{timestamp header}.{raw body}")
    This is NOT Standard Webhooks: the key is the secret's UTF-8 bytes (whsec_ prefix
    kept, nothing decoded) and the digest is hex.
    """
    if secret is None:
        secret = os.environ.get("MAGIC_HOUR_WEBHOOK_SECRET", "")
    if tolerance_seconds is None:
        try:
            tolerance_seconds = int(os.environ.get("MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS", "0") or 0)
        except ValueError:
            tolerance_seconds = 0

    if not secret:
        return "Webhook secret not configured"

    signature = headers.get("magic-hour-event-signature")
    timestamp = headers.get("magic-hour-event-timestamp")
    if not signature:
        return "Missing magic-hour-event-signature header"
    if not timestamp:
        return "Missing magic-hour-event-timestamp header"

    # Check the format before decoding (exact length and alphabet).
    if not HEX_64.fullmatch(signature):
        return "Malformed signature (expected 64 hex characters)"

    # Signed message as bytes: header (latin-1, untouched) + "." + the raw body bytes.
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()

    # compare_digest on bytes, never str
    if not hmac.compare_digest(bytes.fromhex(signature), expected):
        return "Signature mismatch"

    # Opt-in replay window. Off by default: retries and replays resend the original timestamp.
    if tolerance_seconds and tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return "Invalid timestamp"
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return "Timestamp outside tolerance"

    return None


def handle_event(event: dict) -> None:
    """Dispatch on the body's `type`. The payload matches
    GET /v1/{video,image,audio}-projects/:id. Payloads carry no event ID:
    dedupe on f"{payload.id}:{type}"."""
    event_type = event.get("type")
    payload = _as_dict(event.get("payload"))

    if event_type in ("video.started", "image.started", "audio.started"):
        print(f"{event_type}: job {payload.get('id')} is rendering")

    elif event_type in ("video.completed", "image.completed", "audio.completed"):
        print(f"{event_type}: job {payload.get('id')} complete")
        # Download URLs expire: save the files from payload["downloads"][*]["url"] promptly
        for download in _as_list(payload.get("downloads")):
            if not isinstance(download, dict):
                continue
            print(f"  download: {download.get('url')} (expires {download.get('expires_at')})")

    elif event_type in ("video.errored", "image.errored", "audio.errored"):
        error = _as_dict(payload.get("error"))
        print(f"{event_type}: job {payload.get('id')} failed: {error.get('code')} {error.get('message')}")

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/magic-hour")
async def magic_hour_webhook(request: Request):
    # Raw bytes, exactly as received: never parse before verifying.
    raw_body = await request.body()

    error = verify_magic_hour_signature(raw_body, request.headers)
    if error:
        print(f"Magic Hour webhook rejected: {error}")
        raise HTTPException(status_code=401, detail=error)

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail='Expected an object with a string "type"')

    try:
        handle_event(event)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Magic Hour event: {exc}")
        # A non-2xx makes Magic Hour retry (1, 2, 4, ... minutes, up to 24 hours).
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
