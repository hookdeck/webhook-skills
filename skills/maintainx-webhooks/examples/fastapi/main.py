# Generated with: maintainx-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# MaintainX recommends rejecting timestamps older than 5 minutes (seconds)
TOLERANCE_SECONDS = 300


def verify_maintainx_signature(
    raw_body: bytes,
    header: str | None,
    secret: str | None,
    tolerance: int = TOLERANCE_SECONDS,
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

    # Replay protection: reject stale timestamps
    try:
        if abs(time.time() - int(timestamp)) > tolerance:
            return False
    except ValueError:
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
