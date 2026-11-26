# Generated with: authorize-net-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Authorize.net webhook receiver for FastAPI.

Authorize.net signs webhooks with X-ANET-Signature: "sha512=" + the uppercase hex
HMAC-SHA512 of the raw body, keyed with the Signature Key as text (not hex-decoded).
"""

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

logger = logging.getLogger("authorize-net-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Authorize.net Webhook Handler")


def verify_authorize_net_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-ANET-Signature against the exact bytes Authorize.net sent."""
    key = (secret or "").strip()
    # SHA-512 is 64 bytes: 128 hex characters.
    match = re.fullmatch(r"sha512=([0-9a-fA-F]{128})", (signature or "").strip(), re.IGNORECASE)
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Body: {notificationId, eventType, eventDate, webhookId, payload}. payload is a
    summary (entityName + id): fetch the record from the API for more. Dedupe on
    notificationId."""
    event_type = event.get("eventType") or ""
    payload = event.get("payload") or {}
    if event_type.startswith("net.authorize.payment."):
        logger.info("Transaction %s: %s (responseCode %s)", payload.get("id"), event_type, payload.get("responseCode"))
    else:
        logger.info("Authorize.net %s for %s %s", event_type, payload.get("entityName"), payload.get("id"))
    return {"received": True, "event_type": event_type, "event_id": event.get("notificationId")}


@app.post("/webhooks/authorize-net")
async def authorize_net_webhook(request: Request):
    secret = os.environ.get("AUTHORIZE_NET_SIGNATURE_KEY", "")
    if not secret.strip():
        logger.error("AUTHORIZE_NET_SIGNATURE_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_authorize_net_signature(raw_body, request.headers.get("x-anet-signature"), secret):
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
