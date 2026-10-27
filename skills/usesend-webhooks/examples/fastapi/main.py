import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

# X-UseSend-Signature is `v1=<hex>`; the bare digest is accepted too.
HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def verify_usesend(raw_body: bytes, signature: Optional[str], timestamp: Optional[str], secret: Optional[str]) -> bool:
    """useSend signs `${X-UseSend-Timestamp}.${rawBody}` with HMAC-SHA256 and sends the
    lowercase hex digest as `v1=<hex>`. The secret is used whole (including `whsec_`)
    as a plain UTF-8 key. This is NOT Standard Webhooks.

    The message is built as bytes so the raw body is never decoded and re-encoded.
    """
    if not signature or not timestamp or not secret:
        return False
    digest = (signature[3:] if signature.startswith("v1=") else signature).lower()
    # Validate length and alphabet before decoding.
    if not HEX_DIGEST.fullmatch(digest):
        return False
    try:
        ts_bytes = timestamp.encode("latin-1")
    except UnicodeEncodeError:
        return False
    message = b"".join([ts_bytes, b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(digest))


def within_tolerance(timestamp: str, tolerance_seconds: float) -> bool:
    """Opt-in replay window. X-UseSend-Timestamp is Unix MILLISECONDS."""
    if tolerance_seconds <= 0:
        return True
    if not re.fullmatch(r"\d+", timestamp):
        return False
    return abs(time.time() * 1000 - int(timestamp)) <= tolerance_seconds * 1000


async def verified_body(request: Request) -> bytes:
    """Dependency: return the raw body only if the useSend signature checks out."""
    secret = os.getenv("USESEND_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers the exact body, so don't parse it first.
    raw_body = await request.body()
    signature = request.headers.get("x-usesend-signature")
    timestamp = request.headers.get("x-usesend-timestamp")

    if not verify_usesend(raw_body, signature, timestamp, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        tolerance = float(os.getenv("USESEND_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if not within_tolerance(timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")
    return raw_body


@app.post("/webhooks/usesend")
async def usesend_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    event_type = event.get("type")

    # Duplicates are possible: dedupe on event["id"] in production.
    if event_type == "email.delivered":
        print("Email delivered to:", data.get("to"))
    elif event_type == "email.bounced":
        print("Email bounced:", data.get("id"), _as_dict(data.get("bounce")).get("type"))
    elif event_type == "email.complained":
        print("Spam complaint for email:", data.get("id"))
    elif event_type == "email.opened":
        print("Email opened:", data.get("id"))
    elif event_type == "email.clicked":
        print("Link clicked:", _as_dict(data.get("click")).get("url"))
    elif event_type == "contact.created":
        print("Contact created:", data.get("email"))
    elif event_type == "domain.verified":
        print("Domain verified:", data.get("name"))
    elif event_type == "webhook.test":
        print("Test webhook received:", data.get("webhookId") or event.get("webhookId"))
    else:
        print("Unhandled event type:", event_type)

    return {"status": "ok"}
