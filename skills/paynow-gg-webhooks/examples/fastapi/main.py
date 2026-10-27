# Generated with: paynow-gg-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
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

# A PayNow signature is the 44-character padded standard base64 of a SHA-256 digest
SIGNATURE_PATTERN = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_paynow_signature(
    raw_body: bytes,
    timestamp: str | None,
    signature: str | None,
    secret: str | None,
    tolerance_seconds: float = 0,
    now_ms: float | None = None,
) -> str | None:
    """Verify PayNow's PayNow-Signature header. Returns None if valid, else an error message.

    Signed message (as bytes): PayNow-Timestamp header value + "." + raw request body.
    Signature: base64(HMAC-SHA256(secret, message)), the whole header value.
    """
    if not secret:
        return "Webhook secret not configured"
    if not signature or not timestamp:
        return "Missing signature or timestamp header"
    # Validate the format before decoding
    if not SIGNATURE_PATTERN.fullmatch(signature):
        return "Malformed signature"
    try:
        provided = base64.b64decode(signature, validate=True)
    except ValueError:
        return "Malformed signature"
    # Reject non-canonical encodings (stray low bits in the last character): core compares base64 exactly
    if base64.b64encode(provided).decode("ascii") != signature:
        return "Malformed signature"

    # Optional replay protection. Off by default: Hookdeck retries and replays resend the
    # original headers, so a fixed window would reject legitimate deliveries.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return "Invalid timestamp"
        current_ms = now_ms if now_ms is not None else time.time() * 1000
        if abs(current_ms - int(timestamp)) > tolerance_seconds * 1000:
            return "Timestamp outside tolerance"

    # Build the signed message as bytes: header as latin-1, raw body untouched
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()

    if not hmac.compare_digest(provided, expected):
        return "Invalid signature"
    return None


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and reject the request unless PayNow's signature is valid."""
    raw_body = await request.body()
    error = verify_paynow_signature(
        raw_body,
        request.headers.get("paynow-timestamp"),
        request.headers.get("paynow-signature"),
        os.getenv("PAYNOW_WEBHOOK_SECRET"),
        float(os.getenv("PAYNOW_WEBHOOK_TOLERANCE_SECONDS") or 0),
    )
    if error:
        print(f"PayNow webhook rejected: {error}")
        status = 500 if error == "Webhook secret not configured" else 401
        raise HTTPException(status_code=status, detail=error)
    return raw_body


@app.post("/webhooks/paynow-gg")
async def paynow_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event_type") if isinstance(event, dict) else None
    data = _as_dict(event.get("body")) if isinstance(event, dict) else {}

    # Deduplicate on event["event_id"] in production: PayNow retries any non-2xx response
    if event_type == "ON_ORDER_COMPLETED":
        print(f"Order completed: {data.get('id')}")
    elif event_type == "ON_PAYMENT_COMPLETED":
        print(f"Payment completed: {data.get('id')} ({data.get('amount')} {data.get('currency')})")
    elif event_type == "ON_PAYMENT_FAILED":
        print(f"Payment failed: {data.get('id')}")
    elif event_type == "ON_REFUND":
        print(f"Refund completed: {data.get('id')}")
    elif event_type == "ON_SUBSCRIPTION_RENEWED":
        print(f"Subscription renewed: {data.get('id')}")
    elif event_type == "ON_DELIVERY_ITEM_ADDED":
        print(f"Delivery item added: {data.get('id')}")
    else:
        print(f"Unhandled PayNow event: {event_type}")

    return {"received": True}
