# Generated with: kit-webhooks skill
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
# Set KIT_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("KIT_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "KIT_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_kit_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Kit webhook signature.

    Header: ``X-Kit-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`` (two v1 entries while a
    secret rotation window is open).
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the endpoint secret used WHOLE as
    UTF-8 bytes. Do not strip ``whsec_`` or base64-decode it (this is not Standard Webhooks).
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # Hookdeck retries and replays keep the original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


@app.post("/webhooks/kit")
async def kit_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("x-kit-signature")
    secret = os.environ.get("KIT_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing X-Kit-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_kit_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification. The body is an envelope: {delivery_id, events: [...]}.
    try:
        delivery = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(delivery, dict) or not isinstance(delivery.get("events"), list):
        raise HTTPException(status_code=400, detail="Expected an events array")

    # A delivery carries 1-100 events of the same type; always iterate.
    for event in delivery["events"]:
        event_type = event.get("type")
        data = event.get("data") or {}
        email = (data.get("subscriber") or {}).get("email_address")

        if event_type == "subscriber.created":
            print(f"Subscriber created: {email}")
        elif event_type == "subscriber.activated":
            print(f"Subscriber activated: {email}")
        elif event_type == "subscriber.unsubscribed":
            print(f"Subscriber unsubscribed: {email}")
        elif event_type == "subscriber.bounced":
            print(f"Subscriber bounced: {email}")
        elif event_type == "subscriber.complained":
            print(f"Subscriber complained (spam report): {email}")
        elif event_type == "subscriber.subscribed_to_form":
            print(f"Subscriber {email} joined form {(data.get('form') or {}).get('name')}")
        elif event_type == "subscriber.tag_added":
            print(f"Tag \"{(data.get('tag') or {}).get('name')}\" added to {email}")
        elif event_type == "subscriber.tag_removed":
            print(f"Tag \"{(data.get('tag') or {}).get('name')}\" removed from {email}")
        else:
            print(f"Unhandled event type: {event_type}")
        # TODO: persist / forward. Deduplicate on event["id"] (stable across retries and
        # re-emits), not on delivery_id.

    # Any 2xx acknowledges; non-2xx is retried (8 attempts over ~41 hours).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
