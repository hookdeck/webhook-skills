# Generated with: maintainx-webhooks skill
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
# Set MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_maintainx_signature(
    raw_body: bytes,
    header: str | None,
    secret: str | None,
    tolerance: int | None = None,
) -> bool:
    """Verify a MaintainX webhook signature.

    MaintainX sends `x-maintainx-webhook-body-signature: t=<unix>,v1=<hex>`.
    v1 is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret.
    """
    if not header or not secret:
        return False

    # Parse "t=...,v1=..." into {"t": ..., "v1": ...}
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    if not (timestamp.isascii() and timestamp.isdigit()):
        return False

    # MaintainX recommends a 5-minute window. It's opt-in here (tolerance > 0) because
    # retries and replays carry the original timestamp.
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        return False

    # Signed content is "{t}.{raw body}" — use the raw bytes, not parsed JSON
    expected = hmac.new(
        secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/maintainx")
async def maintainx_webhook(request: Request):
    # Read the raw body for signature verification — do not parse JSON first
    raw_body = await request.body()
    header = request.headers.get("x-maintainx-webhook-body-signature")

    if not header:
        raise HTTPException(
            status_code=400, detail="Missing x-maintainx-webhook-body-signature header"
        )

    if not verify_maintainx_signature(
        raw_body, header, os.getenv("MAINTAINX_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid — safe to parse the event
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("eventType")

    if event_type == "NEW_WORK_ORDER":
        print(f"New work order: {event.get('workOrderId')}")
        # TODO: Sync to ticketing/ERP, notify dispatch, etc.
    elif event_type == "WORK_ORDER_CHANGE":
        print(f"Work order changed: {event.get('workOrderId')}")
        # TODO: Update your external record
    elif event_type == "WORK_ORDER_STATUS_CHANGE":
        print(
            f"Work order {event.get('workOrderId')}: "
            f"{event.get('oldStatus')} -> {event.get('newStatus')}"
        )
        # TODO: Close linked tickets, trigger billing when DONE, etc.
    elif event_type == "NEW_WORK_REQUEST":
        print(f"New work request: {event.get('workRequestId')}")
        # TODO: Start triage/approval workflow
    elif event_type == "ASSET_STATUS_CHANGE":
        print(f"Asset status changed: {event.get('assetId')}")
        # TODO: Raise downtime alerts, update dashboards
    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx quickly (MaintainX times out after 10 seconds)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
