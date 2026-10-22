# Generated with: go1-webhooks skill
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
# Set GO1_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("GO1_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "GO1_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_go1_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now_ms: float | None = None,
) -> bool:
    """Verify a Go1 webhook signature.

    Header: ``Go1-Signature: t=<unix MILLISECONDS>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the webhook secret_key as a UTF-8 string.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # `t` is in milliseconds. The window is opt-in (tolerance > 0) because retries and
    # replays carry the original `t`.
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        current_ms = time.time() * 1000 if now_ms is None else now_ms
        if abs(current_ms - int(t)) > tolerance * 1000:
            return False

    # Use `t` exactly as received in the signed string.
    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


@app.post("/webhooks/go1")
async def go1_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("go1-signature")
    secret = os.environ.get("GO1_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing Go1-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_go1_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_type = event.get("event_type")
    if event_type == "enrollment.create":
        print(f"Enrollment created: {event.get('id')}")
    elif event_type == "enrollment.update":
        print(f"Enrollment updated: {event.get('id')}")
    elif event_type == "enrollment.delete":
        print(f"Enrollment deleted: {event.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")
    # TODO: persist / forward. Make handling idempotent (e.g. key on event_type + id).

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
