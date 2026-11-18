# Generated with: mindbody-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Mindbody webhook receiver for FastAPI.

Mindbody delivers events as POSTs with X-Mindbody-Signature: "sha256=" + the
base64 HMAC-SHA256 of the raw body, keyed with the subscription's
messageSignatureKey used as UTF-8 text (it looks like base64, but isn't decoded).
Mindbody also sends a HEAD request when a subscription is created (and when one
is changed with PATCH), and the URL must answer with a 2xx.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("mindbody-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Mindbody Webhook Handler")


def verify_mindbody_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Mindbody-Signature against the exact bytes Mindbody sent."""
    key = (secret or "").strip()
    # SHA-256 is 32 bytes: 44 base64 characters with one '='.
    match = re.fullmatch(r"sha256=([A-Za-z0-9+/]{43}=)", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Every event has the same envelope: messageId (dedupe on it), eventId (the
    event type) and eventData, whose shape depends on eventId."""
    event_id = event.get("eventId")
    data = event.get("eventData") or {}
    if event_id and event_id.startswith("appointmentBooking."):
        logger.info("%s: appointment %s at site %s", event_id, data.get("appointmentId"), data.get("siteId"))
    elif event_id and event_id.startswith("classRosterBooking."):
        logger.info("%s: client %s in class %s", event_id, data.get("clientId"), data.get("classId"))
    elif event_id in ("client.created", "client.updated"):
        logger.info("%s: client %s at site %s", event_id, data.get("clientId"), data.get("siteId"))
    elif event_id == "clientSale.created":
        logger.info("Sale %s at site %s", data.get("saleId"), data.get("siteId"))
    else:
        logger.info("Unhandled Mindbody event: %s", event_id)
    return {"received": True, "event_type": event_id, "event_id": event.get("messageId")}


@app.head("/webhooks/mindbody")
async def mindbody_head_check():
    """Mindbody checks the URL with a HEAD request. It carries no body or
    signature: answer 200 and do nothing else."""
    return Response(status_code=200)


@app.post("/webhooks/mindbody")
async def mindbody_webhook(request: Request):
    secret = os.environ.get("MINDBODY_MESSAGE_SIGNATURE_KEY", "")
    if not secret.strip():
        logger.error("MINDBODY_MESSAGE_SIGNATURE_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_mindbody_signature(raw_body, request.headers.get("x-mindbody-signature"), secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(event)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
