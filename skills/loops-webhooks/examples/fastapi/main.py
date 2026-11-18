# Generated with: loops-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Loops webhook receiver for FastAPI.

Loops signs webhooks with three headers:
  Webhook-Id         unique event ID, use it to skip duplicate deliveries
  Webhook-Timestamp  seconds since epoch
  Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
                     (old and new secret both sign for 24h after a roll)
Signed content: f"{Webhook-Id}.{Webhook-Timestamp}.{raw_body}"
Key: the signing secret from Settings -> Webhooks with an optional whsec_
prefix stripped, then base64-DECODED (as in Loops' own example).
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

logger = logging.getLogger("loops-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Loops Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_event_ids: set = set()


def verify_loops_webhook(
    raw_body: Union[bytes, str],
    headers: Mapping[str, Optional[str]],
    secret: Optional[str],
    tolerance_seconds: Optional[int] = None,
) -> bool:
    """Return True if any v1 signature matches.

    tolerance_seconds is an optional freshness window (None = off). Loops'
    example enforces 300 seconds; a delivery replayed later through a relay
    keeps its original timestamp, so a window rejects it. Dedupe on
    webhook-id either way.
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

    # After a secret roll the header carries one signature per secret.
    # Check every v1 entry; any match passes.
    ok = False
    for entry in signature_header.split():
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
    """Every body has eventName, eventTime (Unix seconds) and webhookSchemaVersion.

    Workflows were called Loops until May 2026; payloads keep the loop names
    (loop.email.sent, loopId, sourceType "loop").
    """
    event_name = event.get("eventName")
    who = (event.get("contactIdentity") or {}).get("email")
    if event_name == "contact.created":
        logger.info("Contact created: %s", who)
    elif event_name in ("contact.unsubscribed", "contact.deleted"):
        logger.info("%s: %s", event_name, who)
    elif event_name in ("contact.mailingList.subscribed", "contact.mailingList.unsubscribed"):
        logger.info("%s: %s %s", event_name, who, (event.get("mailingList") or {}).get("name"))
    elif event_name in ("campaign.email.sent", "loop.email.sent", "transactional.email.sent"):
        logger.info("%s to %s: %s", event_name, who, (event.get("email") or {}).get("subject"))
    elif event_name in (
        "email.delivered",
        "email.opened",
        "email.clicked",
        "email.softBounced",
        "email.hardBounced",
        "email.spamReported",
        "email.unsubscribed",
        "email.resubscribed",
    ):
        logger.info("%s (%s) for %s", event_name, event.get("sourceType"), who)
    elif event_name == "testing.testEvent":
        # Sent by "send test request" on the Webhooks settings page.
        logger.info("Loops test event: %s", event.get("message"))
    else:
        logger.info("Unhandled Loops event: %s", event_name)


@app.post("/webhooks/loops")
async def loops_webhook(request: Request) -> Dict[str, Any]:
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("LOOPS_WEBHOOK_SECRET")
    if not secret:
        logger.error("LOOPS_WEBHOOK_SECRET is not set: rejecting delivery")
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
    tolerance_env = os.environ.get("LOOPS_WEBHOOK_TOLERANCE_SECONDS")
    tolerance = int(tolerance_env) if tolerance_env else None
    if not verify_loops_webhook(raw_body, headers, secret, tolerance):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The same event can be sent more than once: skip a Webhook-Id already seen.
    event_id = headers["webhook-id"]
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    # Respond within 15 seconds: verify, enqueue, return 2xx, work asynchronously.
    handle_event(event)
    processed_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
