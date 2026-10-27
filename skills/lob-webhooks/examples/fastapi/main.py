# Generated with: lob-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import math
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_lob_signature(
    raw_body: bytes, signature: str | None, timestamp: str | None, secret: str | None
) -> bool:
    """Verify a Lob webhook signature.

    Lob-Signature = lowercase hex HMAC-SHA256(secret, f"{Lob-Signature-Timestamp}.{raw body}").
    The signed message is built as BYTES: the timestamp header exactly as received (latin-1),
    a literal ".", then the raw body bytes. Never decode and re-encode the body.
    """
    if not secret or not signature or not timestamp:
        return False

    # Validate the format before decoding (exact length and alphabet).
    if not HEX_DIGEST.fullmatch(signature):
        return False

    try:
        timestamp_bytes = timestamp.encode("latin-1")
    except UnicodeEncodeError:
        return False

    message = b"".join([timestamp_bytes, b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    # Hex is case-insensitive: decode both sides to bytes, then compare in constant time.
    received = bytes.fromhex(signature.lower())
    return hmac.compare_digest(expected, received)


def is_timestamp_fresh(timestamp: str | None, tolerance_seconds: float) -> bool:
    """Optional replay protection (Lob's step 4). Off unless tolerance_seconds > 0.

    Hookdeck retries and replays re-send the ORIGINAL timestamp, so a fixed window would reject
    legitimate retries - leave it off when Lob delivers through Hookdeck.
    Lob does not document the timestamp unit, so a ~10-digit value is read as seconds and a
    ~13-digit value as milliseconds.
    """
    if not tolerance_seconds > 0:
        return True
    try:
        value = float(timestamp or "")
    except ValueError:
        return False
    if not math.isfinite(value):
        return False
    timestamp_ms = value * 1000 if abs(value) < 1e11 else value
    return abs(time.time() * 1000 - timestamp_ms) <= tolerance_seconds * 1000


def tolerance_from_env() -> float:
    try:
        return float(os.environ.get("LOB_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0.0


async def verified_lob_event(request: Request) -> dict:
    """Dependency: verify the signature on the RAW body, then parse the JSON."""
    secret = os.environ.get("LOB_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Use the RAW bytes for verification - do not call request.json() first.
    raw_body = await request.body()
    signature = request.headers.get("lob-signature")
    timestamp = request.headers.get("lob-signature-timestamp")

    if not verify_lob_signature(raw_body, signature, timestamp, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if not is_timestamp_fresh(timestamp, tolerance_from_env()):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Signature verified - safe to parse.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    return event


# Lob webhook endpoint (Lob sends POST).
@app.post("/webhooks/lob")
async def lob_webhook(event: dict = Depends(verified_lob_event)):
    # The event type is event_type.id; the mailpiece/resource is in event["body"].
    event_type = _as_dict(event.get("event_type")).get("id")
    resource = event.get("body") or {}
    resource_id = resource.get("id") if isinstance(resource, dict) else None

    # TODO: use event["id"] to deduplicate (Lob retries until it sees a 2xx).
    if event_type == "postcard.created":
        print(f"Postcard created: {resource_id}")
    elif event_type == "postcard.delivered":
        print(f"Postcard delivered: {resource_id}")
        # TODO: trigger the downstream "mail delivered" workflow.
    elif event_type == "postcard.re-routed":
        print(f"Postcard re-routed: {resource_id}")
    elif event_type == "letter.mailed":
        print(f"Letter mailed: {resource_id}")
    elif event_type == "letter.delivered":
        print(f"Letter delivered: {resource_id}")
    elif event_type == "check.in_transit":
        print(f"Check in transit: {resource_id}")
    elif event_type == "self_mailer.rendered_thumbnails":
        print(f"Self mailer thumbnails rendered: {resource_id}")
        # TODO: download resource["thumbnails"] (small/medium/large URLs) if payload redaction is off.
    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx quickly: anything else makes Lob retry (8 attempts over ~27.5 hours).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
