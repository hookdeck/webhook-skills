# Generated with: cerebrum-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Cerebrum webhook receiver for FastAPI.

Cerebrum delivers webhooks through Svix (Standard Webhooks):
  svix-id         unique message ID (stable across retries)
  svix-timestamp  Unix seconds when the attempt was sent
  svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
Signed content: f"{id}.{timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
The same three values can arrive as webhook-id / webhook-timestamp /
webhook-signature; Hookdeck reads either set, and so does this handler.
"""

import json
import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("cerebrum-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Cerebrum Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Dedupe on the message ID header: it is the same on every retry.
processed_message_ids: set = set()


def get_signature_headers(headers: Mapping[str, str]) -> Optional[Dict[str, str]]:
    """Pick one complete set of signature headers.

    svix-* wins when svix-id is present, otherwise webhook-* is used (the same
    rule Hookdeck applies). Returns the three values under the names the svix
    library reads, or None if any of them is missing.
    """
    prefix = "svix" if headers.get("svix-id") else "webhook"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature}


def verify_cerebrum_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Cerebrum delivery with the svix library.

    It recomputes the HMAC-SHA256 over `{id}.{timestamp}.{raw_body}`, compares
    every `v1,` entry in constant time, and rejects timestamps more than 5
    minutes from now. The 5-minute window also applies to Hookdeck retries and
    replays, which resend the original timestamp; see references/verification.md
    for a manual verifier without the window. Raises WebhookVerificationError on
    failure, ValueError if the body is not JSON.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_cerebrum_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified payload or raises."""
    secret = os.environ.get("CEREBRUM_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("CEREBRUM_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = get_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        payload = verify_cerebrum_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, bad JSON
        logger.error("Cerebrum webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    request.state.message_id = headers["svix-id"]
    return payload


def handle_event(payload: Dict[str, Any]) -> None:
    """Payload: {id, idType, additionalMetadata, event, eventDate, svixAppId, metadata}.

    `metadata.delta` is a JSON-Patch-style change list on some order updates.
    """
    event = payload.get("event")
    obj_id = payload.get("id")
    id_type = payload.get("idType")
    metadata = payload.get("metadata") or {}

    # --- Orders ---------------------------------------------------------------
    if event in ("ORDER_STATUS_CHANGE", "ORDER_SCORE_CHANGE", "ORDER_CUSTOM_SCORE_CHANGE"):
        delta = metadata.get("delta")
        logger.info("%s: %s %s%s", event, id_type, obj_id, f" ({len(delta)} changes)" if delta else "")
    elif event == "ORDER_DISPUTE_RESOLVED":
        logger.info("Order dispute resolved: %s %s", id_type, obj_id)

    # --- Vouchers (vID) -------------------------------------------------------
    elif event in ("VOUCHER_STARTED", "VOUCHER_REDEEMED", "VOUCHER_EXPIRED"):
        logger.info("%s: %s %s", event, id_type, obj_id)

    # --- Monitoring and Beam --------------------------------------------------
    elif event == "MONITORING_REPORT_GENERATED":
        logger.info("Monitoring report generated: %s %s", id_type, obj_id)
    elif event == "BEAM_INPUT_CREATED":
        logger.info("Beam input created: %s %s", id_type, obj_id)

    else:
        # The documented list may not be exhaustive: acknowledge, don't fail.
        logger.info("Unhandled Cerebrum event: %s", event)


@app.post("/webhooks/cerebrum")
async def cerebrum_webhook(request: Request, payload: Dict[str, Any] = Depends(verified_cerebrum_event)):
    # Retries reuse the same message ID; acknowledge duplicates with 200.
    message_id = request.state.message_id
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Cerebrum needs a 2xx within 30 seconds. In production, enqueue the
        # payload here and process it asynchronously.
        handle_event(payload)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Cerebrum event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
