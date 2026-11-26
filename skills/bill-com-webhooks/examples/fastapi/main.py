# Generated with: bill-com-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""BILL webhook receiver for FastAPI.

BILL signs every event notification with x-bill-sha-signature: the base64
HMAC-SHA256 of the body, keyed with the subscription's securityKey as text.
BILL sends the body as compact (minified) JSON, so HMAC the raw bytes exactly as
received and never re-serialise them.
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
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("bill-com-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BILL Webhook Handler")


def verify_bill_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Bill-Sha-Signature against the exact bytes BILL sent."""
    key = (secret or "").strip()
    # SHA-256 is 32 bytes: 44 base64 characters with one '='.
    match = re.fullmatch(r"([A-Za-z0-9+/]{43}=)", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Body: {metadata: {eventId, subscriptionId, organizationId, eventType, version},
    payload: {...}}. Dedupe on metadata.eventId: notifications can repeat and
    arrive out of order."""
    metadata = event.get("metadata") or {}
    event_type = metadata.get("eventType")
    if event_type == "test":
        logger.info("BILL test notification for subscription %s", metadata.get("subscriptionId"))
    elif event_type in ("bill.created", "bill.updated", "bill.archived"):
        logger.info("%s in organization %s", event_type, metadata.get("organizationId"))
    else:
        logger.info("BILL event %s (version %s)", event_type, metadata.get("version"))
    return {"received": True, "event_type": event_type, "event_id": metadata.get("eventId")}


@app.post("/webhooks/bill-com")
async def bill_webhook(request: Request):
    secret = os.environ.get("BILL_WEBHOOK_SECURITY_KEY", "")
    if not secret.strip():
        logger.error("BILL_WEBHOOK_SECURITY_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_bill_signature(raw_body, request.headers.get("x-bill-sha-signature"), secret):
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
