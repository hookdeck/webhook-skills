# Generated with: medusa-webhooks skill
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

# Optional replay window in seconds. Off by default (0): Medusa re-signs its own retries, but
# Hookdeck retries and replays resend the original timestamp, so a window would reject late
# redeliveries. Set MEDUSA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any
# other value is treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MEDUSA_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MEDUSA_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_medusa_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Medusa Cloud webhook signature.

    Header: ``X-Medusa-Signature: t=<unix seconds>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the endpoint signing secret as UTF-8.
    """
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signatures = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not signatures:
        return False

    # Medusa's docs suggest a 5-minute window, but Hookdeck retries and replays carry the
    # original `t`, so the window is opt-in (tolerance > 0).
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in signatures)


@app.post("/webhooks/medusa")
async def medusa_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("x-medusa-signature")
    secret = os.environ.get("MEDUSA_WEBHOOK_SECRET")

    if not header:
        raise HTTPException(status_code=400, detail="Missing X-Medusa-Signature header")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not verify_medusa_webhook(raw_body, header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification. The body is one event object: {id, type, data, created_at}.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected an event object")

    event_type = event.get("type")
    data = event.get("data") or {}
    where = f"{(data.get('project') or {}).get('handle')}/{(data.get('environment') or {}).get('handle')}"
    build = data.get("build") or {}
    deployment = data.get("deployment") or {}

    if event_type == "build.created":
        print(f"Build created for {where}: {build.get('id')}")
    elif event_type == "build.succeeded":
        print(f"Build succeeded for {where}: {build.get('id')} ({build.get('commit_hash')})")
    elif event_type == "build.failed":
        print(f"Build failed for {where}: {build.get('id')}")
    elif event_type == "build.canceled":
        print(f"Build canceled for {where}: {build.get('id')}")
    elif event_type == "deployment.created":
        print(f"Deployment created for {where}: {deployment.get('id')}")
    elif event_type == "deployment.succeeded":
        print(f"Deployment succeeded for {where}: {deployment.get('id')}")
    elif event_type == "deployment.failed":
        print(f"Deployment failed for {where}: {deployment.get('id')}")
    elif event_type == "deployment.canceled":
        print(f"Deployment canceled for {where}: {deployment.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")
    # TODO: persist / forward. `id` (also the X-Medusa-Delivery header) is reused across
    # retries of the same event: use it as the idempotency key.
    print(f"Processed delivery {event.get('id')}")

    # Respond 2xx within ten seconds, otherwise Medusa retries (it doesn't follow redirects).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
