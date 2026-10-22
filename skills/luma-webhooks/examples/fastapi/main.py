# Generated with: luma-webhooks skill
# https://github.com/hookdeck/webhook-skills
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
# Set LUMA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("LUMA_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "LUMA_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_luma_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Luma webhook signature.

    Header: ``Webhook-Signature: t=<unix seconds>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the WHOLE secret string
    (including the ``whsec_`` prefix) as UTF-8. This is not Standard Webhooks.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # Luma suggests rejecting old timestamps, but retries (and Hookdeck's) carry the
    # original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


@app.post("/webhooks/luma")
async def luma_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("webhook-signature")
    secret = os.environ.get("LUMA_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing Webhook-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_luma_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification. Body shape: {"type": ..., "data": ...}.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected an event object")

    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "guest.registered":
        print(f"Guest registered: {data.get('user_email')} for {(data.get('event') or {}).get('name')}")
    elif event_type == "guest.updated":
        print(f"Guest updated: {data.get('user_email')} ({data.get('approval_status')})")
    elif event_type == "guest.refunded":
        print(f"Guest refunded: {data.get('user_email')}")
    elif event_type == "ticket.registered":
        print(f"Ticket registered: {(data.get('event_ticket') or {}).get('id')} for {data.get('user_email')}")
    elif event_type == "event.created":
        print(f"Event created: {data.get('name')} ({data.get('id')})")
    elif event_type == "event.updated":
        print(f"Event updated: {data.get('name')} ({data.get('id')})")
    elif event_type == "event.canceled":
        print(f"Event canceled: {data.get('name')} ({data.get('id')})")
    elif event_type == "calendar.event.added":
        print(f"Event added to calendar: {data.get('name') or data.get('id')}")
    elif event_type == "calendar.event.submitted":
        print(f"Event submitted for approval: {data.get('name') or data.get('id')}")
    elif event_type == "calendar.person.subscribed":
        print(f"Calendar person subscribed: {data.get('email')}")
    elif event_type == "calendar.person.unsubscribed":
        print(f"Calendar person unsubscribed: {data.get('email')}")
    else:
        print(f"Unhandled event type: {event_type}")
    # TODO: persist / forward. Use the Webhook-Id header as an idempotency key; Luma may
    # deliver the same event more than once.

    # Respond 2xx within 5 seconds, otherwise Luma retries (a 410 pauses the webhook).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
