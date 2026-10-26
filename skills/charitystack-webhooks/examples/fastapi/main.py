# Generated with: charitystack-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import hashlib
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="
HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")
DECIMAL = re.compile(r"[0-9]+")


def tolerance_from_env() -> int:
    """Optional replay window in seconds. Off by default (unset or 0): Hookdeck
    retries and replays resend the original headers, so a fixed window would
    reject legitimate deliveries."""
    try:
        return max(int(os.getenv("CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS", "0")), 0)
    except ValueError:
        return 0


def verify_charitystack_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    secret: str,
    tolerance_seconds: int = 0,
    now: int | None = None,
) -> tuple[bool, str | None]:
    """Verify a CharityStack webhook signature.

    Header:         X-Webhook-Signature: sha256=<hex> (bare hex is accepted too)
    Signed content: f"{X-Webhook-Timestamp}." + raw body bytes
    Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
    """
    if not signature_header:
        return False, "Missing X-Webhook-Signature header"
    if not timestamp_header:
        return False, "Missing X-Webhook-Timestamp header"

    digest = signature_header
    if digest.startswith(SIGNATURE_PREFIX):
        digest = digest[len(SIGNATURE_PREFIX):]
    # Validate length and alphabet before decoding.
    if not HEX_SHA256.fullmatch(digest):
        return False, "Malformed X-Webhook-Signature header"

    if tolerance_seconds > 0:
        # Unix seconds. Checked only when the opt-in tolerance is set.
        if not DECIMAL.fullmatch(timestamp_header):
            return False, "Malformed X-Webhook-Timestamp header"
        current = int(time.time()) if now is None else now
        if abs(current - int(timestamp_header)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    # Build the signed message as bytes: header value as latin-1, raw body untouched.
    try:
        signed_content = b"".join([timestamp_header.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False, "Malformed X-Webhook-Timestamp header"
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    received = bytes.fromhex(digest)

    if hmac.compare_digest(expected, received):
        return True, None
    return False, "Invalid signature"


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body, check the signature, return the bytes."""
    secret = os.getenv("CHARITYSTACK_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    valid, error = verify_charitystack_signature(
        raw_body,
        request.headers.get("x-webhook-signature"),
        request.headers.get("x-webhook-timestamp"),
        secret,
        tolerance_from_env(),
    )
    if not valid:
        print(f"CharityStack webhook verification failed: {error}")
        raise HTTPException(status_code=401, detail=error)
    return raw_body


def handle_event(event: dict, delivery_id: str | None) -> None:
    event_type = event.get("type")
    if event_type == "donation.created":
        print(f"New donation received (delivery {delivery_id})")
    elif event_type == "donation.updated":
        print(f"Donation status changed (delivery {delivery_id})")
    elif event_type == "subscription.created":
        print(f"Recurring subscription started (delivery {delivery_id})")
    elif event_type == "subscription.updated":
        # Also fires alongside subscription.payment_method_updated.
        print(f"Subscription modified (delivery {delivery_id})")
    elif event_type == "subscription.cancelled":
        print(f"Subscription cancelled (delivery {delivery_id})")
    elif event_type == "subscription.payment_method_updated":
        print(f"Subscription payment method updated (delivery {delivery_id})")
    elif event_type in ("contact.created", "contact.updated"):
        print(f"{event_type} (delivery {delivery_id})")
    else:
        # form.created, form.updated and any future types: log and acknowledge.
        print(f"Unhandled CharityStack event type: {event_type}")


@app.post("/webhooks/charitystack")
async def charitystack_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # In production: persist the event, return 2xx, then process asynchronously.
    handle_event(event, request.headers.get("x-webhook-id"))

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
