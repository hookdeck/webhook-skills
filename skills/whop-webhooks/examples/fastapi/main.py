import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set WHOP_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("WHOP_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "WHOP_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


class WebhookVerificationError(Exception):
    pass


def verify_whop_webhook(raw_body: bytes, headers, secret: str, tolerance: int | None = None) -> dict:
    """Verify a Whop delivery (Standard Webhooks) and return the parsed body; raise if invalid.

    Written out rather than calling the SDK's unwrap(), because that always enforces a
    5-minute timestamp window. Hookdeck retries and replays carry the original
    webhook-timestamp, so that window would reject them. Here the window is opt-in via
    WHOP_TIMESTAMP_TOLERANCE_SECONDS.
    """
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (msg_id and timestamp and signature_header):
        raise WebhookVerificationError("Missing webhook-* signature headers")
    if not (timestamp.isascii() and timestamp.isdigit()):
        raise WebhookVerificationError("Invalid webhook-timestamp")
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        raise WebhookVerificationError("Timestamp outside tolerance")

    # The key is the literal UTF-8 bytes of the ws_ secret: don't strip ws_ or base64-decode it
    expected = hmac.new(secret.encode(), f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # webhook-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return json.loads(raw_body)
    raise WebhookVerificationError("No matching signature")


@app.post("/webhooks/whop")
async def whop_webhook(request: Request):
    secret = os.getenv("WHOP_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body: Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}".
    payload = await request.body()

    try:
        # Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>). The secret is
        # used exactly as Whop issued it (ws_...). The timestamp window is opt-in
        # (WHOP_TIMESTAMP_TOLERANCE_SECONDS).
        event = verify_whop_webhook(payload, request.headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        print(f"Whop signature verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type")
    data = event.get("data") or {}

    # Retries reuse the same webhook-id: store it and skip duplicates in production.
    if event_type == "payment.succeeded":
        print(f"Payment succeeded: {data.get('id')}")
    elif event_type == "payment.failed":
        print(f"Payment failed: {data.get('id')}")
    elif event_type == "membership.activated":
        print(f"Membership activated: {data.get('id')}")
    elif event_type == "membership.deactivated":
        print(f"Membership deactivated: {data.get('id')}")
    elif event_type == "refund.created":
        print(f"Refund created: {data.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    # Respond 2xx within 5 seconds or Whop retries.
    return {"received": True}
