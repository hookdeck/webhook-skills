# Generated with: monnify-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Monnify webhook receiver for FastAPI.

Monnify signs webhooks with monnify-signature: the lowercase hex HMAC-SHA512 of the
raw (compact JSON) body, keyed with your client secret key as text. The sandbox
sends no monnify-signature header.
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

logger = logging.getLogger("monnify-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Monnify Webhook Handler")


def verify_monnify_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify monnify-signature against the exact bytes Monnify sent."""
    key = (secret or "").strip()
    # SHA-512 is 64 bytes: 128 hex characters.
    match = re.fullmatch(r"([0-9a-fA-F]{128})", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Body: {eventType, eventData}. For transactions, confirm paymentStatus and
    amountPaid before you fulfil, and dedupe on transactionReference."""
    event_type = event.get("eventType")
    data = event.get("eventData") or {}
    if event_type == "SUCCESSFUL_TRANSACTION":
        logger.info("Payment %s: %s %s %s", data.get("transactionReference"), data.get("paymentStatus"),
                    data.get("amountPaid"), data.get("currency"))
    else:
        logger.info("Monnify event %s for %s", event_type, data.get("transactionReference"))
    return {"received": True, "event_type": event_type, "reference": data.get("transactionReference")}


@app.post("/webhooks/monnify")
async def monnify_webhook(request: Request):
    secret = os.environ.get("MONNIFY_CLIENT_SECRET", "")
    if not secret.strip():
        logger.error("MONNIFY_CLIENT_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_monnify_signature(raw_body, request.headers.get("monnify-signature"), secret):
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
