# Generated with: stedi-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Stedi event destination webhook receiver for FastAPI.

Stedi follows the Standard Webhooks specification:
  webhook-id         unique message ID, "msg_{UUID}" (stable across retries)
  webhook-timestamp  Unix seconds when Stedi CREATED the event (not delivered)
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the destination's secret after its `whsec_` prefix.
(Stedi's docs describe the signed payload as "timestamp.body"; the Standard
Webhooks spec and the standardwebhooks library include the id.)
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("stedi-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Stedi Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Stedi recommends deduping on the webhook-id header.
processed_message_ids: set = set()


def verify_stedi_webhook(
    raw_body: bytes,
    msg_id: str,
    timestamp: str,
    signature_header: str,
    secret: str,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Stedi delivery manually.

    The standardwebhooks package would also work, but it hard-codes a 5-minute
    timestamp window. Stedi retries for up to 48 hours with the original
    creation timestamp, so every retry would be rejected. Here the window is
    optional (0 disables it).
    """
    if tolerance_seconds > 0:
        try:
            age = abs(int(time.time()) - int(timestamp))
        except ValueError:
            return False
        if age > tolerance_seconds:
            return False

    secret_part = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(secret_part)
    except (binascii.Error, ValueError):
        return False

    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()

    # Several "v1,<sig>" entries are present while a rotated secret is still valid.
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(received, expected):
            return True
    return False


async def verified_stedi_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Stedi event or raises."""
    secret = os.environ.get("STEDI_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("STEDI_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    msg_id = request.headers.get("webhook-id")
    timestamp = request.headers.get("webhook-timestamp")
    signature = request.headers.get("webhook-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    tolerance = int(os.environ.get("STEDI_TIMESTAMP_TOLERANCE_SECONDS") or 0)
    if not verify_stedi_webhook(raw_body, msg_id, timestamp, signature, secret, tolerance):
        logger.error("Stedi webhook verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    request.state.webhook_id = msg_id
    return event


def find_related(event: Dict[str, Any], predicate) -> Optional[Dict[str, Any]]:
    return next((r for r in event.get("relatedResources") or [] if predicate(r)), None)


def handle_event(event: Dict[str, Any]) -> None:
    """Stedi events are thin: fetch the resource through the Stedi API before acting."""
    event_type = event.get("type")
    resource = event.get("resource") or {}

    if event_type == "event.ping":
        logger.info("Ping from destination %s", resource.get("id"))

    # --- Transaction enrollment ----------------------------------------------
    elif event_type == "enrollment.activated":
        logger.info("Enrollment %s is LIVE", resource.get("id"))
    elif event_type == "enrollment.rejected":
        logger.info("Enrollment %s was rejected by the payer", resource.get("id"))
    elif event_type == "enrollment.updated":
        logger.info("Enrollment %s changed", resource.get("id"))
    elif event_type in (
        "enrollment.task.assigned",
        "enrollment.task.completed",
        "enrollment.task.deleted",
    ):
        enrollment = find_related(event, lambda r: r.get("type") == "enrollment") or {}
        logger.info("%s: task %s (enrollment %s)", event_type, resource.get("id"), enrollment.get("id"))

    # --- File processing -------------------------------------------------------
    elif event_type == "file.processed":
        logger.info("File processed: execution %s", resource.get("id"))
    elif event_type == "file.failed":
        logger.info("File failed: execution %s", resource.get("id"))
    elif event_type == "transaction.processed":
        # relatedResources holds transaction.x12.<set id> (e.g. 835, 277) and the execution
        txn = find_related(event, lambda r: str(r.get("type", "")).startswith("transaction.x12.")) or {}
        logger.info("Transaction processed: %s %s", txn.get("type"), txn.get("id") or resource.get("id"))

    # --- OAuth apps ---------------------------------------------------------------
    elif event_type in ("app.installed", "app.uninstalled"):
        client = find_related(event, lambda r: r.get("type") == "app.client") or {}
        logger.info("%s: app %s (client %s)", event_type, resource.get("id"), client.get("id"))

    else:
        logger.info("Unhandled Stedi event type: %s", event_type)


@app.post("/webhooks/stedi")
async def stedi_webhook(request: Request, event: Dict[str, Any] = Depends(verified_stedi_event)):
    # Retries and manual recoveries reuse the same webhook-id; acknowledge duplicates with 200.
    msg_id = request.state.webhook_id
    if msg_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # In production, enqueue here and process asynchronously.
        handle_event(event)
        processed_message_ids.add(msg_id)
    except Exception:
        logger.exception("Error handling Stedi event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
