# Generated with: tailscale-webhooks skill
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
# Set TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_tailscale_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Tailscale webhook signature.

    Header: ``Tailscale-Webhook-Signature: t=<unix seconds>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the webhook secret as a raw string.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # Tailscale suggests a 5-minute window, but its own hourly retries (and Hookdeck's)
    # carry the original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


@app.post("/webhooks/tailscale")
async def tailscale_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("tailscale-webhook-signature")
    secret = os.environ.get("TAILSCALE_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing Tailscale-Webhook-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_tailscale_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification. The root of the payload is an array of events.
    try:
        events = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="Expected an array of events")

    for event in events:
        event_type = event.get("type")
        data = event.get("data") or {}

        if event_type == "nodeCreated":
            print(f"Node created in {event.get('tailnet')}: {data.get('deviceName')} ({data.get('nodeID')})")
        elif event_type == "nodeNeedsApproval":
            print(f"Node needs approval: {data.get('deviceName')}")
        elif event_type == "nodeApproved":
            print(f"Node approved: {data.get('deviceName')}")
        elif event_type == "nodeKeyExpiringInOneDay":
            print(f"Node key expiring within a day: {data.get('deviceName')}")
        elif event_type == "nodeDeleted":
            print(f"Node deleted: {data.get('deviceName')}")
        elif event_type == "policyUpdate":
            print(f"Policy file updated by {data.get('actor')}")
        elif event_type == "userCreated":
            print(f"User created: {data.get('user') or event.get('message')}")
        elif event_type == "test":
            print("Received Tailscale test event")
        else:
            print(f"Unhandled event type: {event_type}")
        # TODO: persist / forward. Events have no id: use type + timestamp + data.nodeID
        # as an idempotency key.

    # Always 2XX unless there is a transient failure, otherwise Tailscale retries.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
