# Generated with: oncehub-webhooks skill
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
# Set ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_oncehub_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a OnceHub (v2) webhook signature.

    Header: ``Oncehub-Signature: t=<unix seconds>,s=<hex>``
    s = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the endpoint secret as a UTF-8 string.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "s"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # A 5-minute window would reject late retries: OnceHub's and Hookdeck's retries and replays
    # resend the original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in signatures)


@app.post("/webhooks/oncehub")
async def oncehub_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("oncehub-signature")
    secret = os.environ.get("ONCEHUB_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing Oncehub-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_oncehub_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification. The body is a single event object.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected an event object")

    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "booking.scheduled":
        print(f"Booking scheduled: {data.get('id')} ({data.get('subject')}) at {data.get('starting_time')}")
    elif event_type == "booking.rescheduled":
        print(f"Booking rescheduled: {data.get('id')} (was {data.get('rescheduled_booking_id')})")
    elif event_type == "booking.reassigned":
        print(f"Booking reassigned: {data.get('id')} to {(data.get('owner') or {}).get('email')}")
    elif event_type == "booking.canceled_then_rescheduled":
        print(f"Booking canceled then rescheduled: {data.get('id')}")
    elif event_type == "booking.canceled_reschedule_requested":
        print(f"Booking canceled, reschedule requested: {data.get('id')}")
    elif event_type == "booking.canceled":
        reason = (data.get("cancel_reschedule_information") or {}).get("reason") or "no reason"
        print(f"Booking canceled: {data.get('id')} ({reason})")
    elif event_type == "booking.completed":
        print(f"Booking completed: {data.get('id')}")
    elif event_type == "booking.no_show":
        print(f"Booking no-show: {data.get('id')}")
    elif event_type in ("conversation.started", "conversation.closed", "conversation.abandoned"):
        print(f"{event_type}: {data.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")
    # TODO: persist / forward. Use the event `id` (EVNT-...) as the idempotency key.

    # Return 2XX once accepted; otherwise OnceHub retries (exponential backoff, ~3 days) and then disables the webhook.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
