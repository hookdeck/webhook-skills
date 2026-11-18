# Generated with: brex-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Brex webhook receiver for FastAPI.

Brex signs webhooks the Standard Webhooks way:
  Webhook-Id         unique message ID, the same when a message is resent
  Webhook-Timestamp  Unix seconds of this attempt
  Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
Signed content: f"{Webhook-Id}.{Webhook-Timestamp}.{raw_body}"
Key: the base64-DECODED secret from GET /v1/webhooks/secrets. Brex's guide
shows a bare base64 secret; its API reference example shows "whsec_...".
Strip an optional whsec_ prefix, then base64-decode.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Mapping, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("brex-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Brex Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_message_ids: set = set()


def verify_brex_webhook(
    raw_body: Union[bytes, str],
    headers: Mapping[str, Optional[str]],
    secret: Optional[str],
    tolerance_seconds: Optional[int] = None,
) -> bool:
    """Return True if any v1 signature matches.

    tolerance_seconds is an optional freshness window (None = off). Brex's
    guide recommends one; a delivery replayed later through a relay keeps its
    original timestamp, so a window rejects it. Dedupe on webhook-id either way.
    """
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not webhook_id or not timestamp or not signature_header or not secret:
        return False
    if not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False

    try:
        key = base64.b64decode(secret.removeprefix("whsec_"), validate=True)
    except (binascii.Error, ValueError):
        return False
    if not key:
        return False

    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    expected = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()

    # After a key rotation Brex sends one signature per key. Accept any v1 match;
    # ignore other versions (Brex's example header includes a v2 entry).
    ok = False
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            ok = True
    return ok


def handle_event(event: Dict[str, Any]) -> None:
    """Brex payloads are flat: event_type plus IDs to look up with the Brex API."""
    event_type = event.get("event_type")
    if event_type in ("TRANSFER_PROCESSED", "TRANSFER_FAILED"):
        state = "processed" if event_type == "TRANSFER_PROCESSED" else "failed"
        logger.info("Transfer %s %s (%s)", event.get("transfer_id"), state, event.get("payment_type"))
    elif event_type == "EXPENSE_PAYMENT_UPDATED":
        logger.info("Expense %s: %s %s", event.get("expense_id"), event.get("payment_status"), event.get("payment_type"))
    elif event_type == "USER_UPDATED":
        logger.info("User %s updated: %s", event.get("user_id"), ", ".join(event.get("updated_attributes") or []))
    elif event_type in ("REFERRAL_CREATED", "REFERRAL_ACTIVATED", "REFERRAL_APPLICATION_STATUS_CHANGED"):
        logger.info("%s for referral %s", event_type, event.get("referral_id"))
    elif event_type == "ACCOUNTING_RECORD_READY_FOR_EXPORT":
        # This event uses camelCase fields (accountingRecordIds, companyId).
        logger.info("%d accounting records ready", len(event.get("accountingRecordIds") or []))
    else:
        logger.info("Unhandled Brex event type: %s", event_type)


@app.post("/webhooks/brex")
async def brex_webhook(request: Request) -> Dict[str, Any]:
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("BREX_WEBHOOK_SECRET")
    if not secret:
        logger.error("BREX_WEBHOOK_SECRET is not set: rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()
    tolerance_env = os.environ.get("BREX_WEBHOOK_TOLERANCE_SECONDS")
    tolerance = int(tolerance_env) if tolerance_env else None
    if not verify_brex_webhook(raw_body, headers, secret, tolerance):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Webhook-Id is the same when Brex resends a message: acknowledge duplicates.
    message_id = headers["webhook-id"]
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    handle_event(event)
    processed_message_ids.add(message_id)
    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
