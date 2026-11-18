# Generated with: samsara-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Samsara webhook receiver for FastAPI.

Samsara signs each webhook with two headers:
  X-Samsara-Timestamp: <unix seconds>
  X-Samsara-Signature: v1=<hex HMAC-SHA256 of "v1:<timestamp>:<raw body>">
The secret key on the webhook's page is base64: decode it to get the HMAC key.
"""

import base64
import binascii
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

logger = logging.getLogger("samsara-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Samsara Webhook Handler")


def decode_base64_secret(secret: Optional[str]) -> Optional[bytes]:
    """The secret is issued base64-encoded: the HMAC key is its decoded bytes.

    Python's default decoder drops characters it doesn't know, so insist on
    canonical base64 instead of keying with the wrong bytes. Surrounding
    whitespace (a pasted trailing newline) is trimmed.
    """
    value = (secret or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", value):
        return None
    try:
        key = base64.b64decode(value + "=" * (-len(value) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    if not key or base64.b64encode(key).decode().rstrip("=") != value.rstrip("="):
        return None
    return key


def verify_samsara_webhook(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Check X-Samsara-Signature against the raw body and X-Samsara-Timestamp."""
    key = decode_base64_secret(secret)
    if key is None or not signature or not timestamp:
        return False
    # "v1" is the only signature version; any other prefix is not from Samsara.
    match = re.fullmatch(r"v1=((?:[0-9a-fA-F]{2})+)", signature.strip())
    if not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    signed = b"v1:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(payload: Any, raw_body: bytes = b"") -> Dict[str, Any]:
    """Alert webhooks send eventType "Alert", and the Test button sends "Ping".
    Event Subscriptions use their own eventType names, such as "DvirSubmitted"."""
    data = payload if isinstance(payload, dict) else {}
    event_id = data.get("eventId")
    event_type = data.get("eventType")
    if event_type == "Ping":
        logger.info("Samsara test ping %s", event_id)
    elif event_type == "Alert":
        logger.info("Samsara alert %s", event_id)
    else:
        logger.info("Samsara %s event %s", event_type, event_id)
    # Samsara retries non-2xx responses: use eventId to skip duplicates.
    return {"received": True, "eventType": event_type}


@app.post("/webhooks/samsara")
async def samsara_webhook(request: Request):
    secret = os.environ.get("SAMSARA_WEBHOOK_SECRET")
    if not secret:
        logger.error("SAMSARA_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_base64_secret(secret) is None:
        logger.error("SAMSARA_WEBHOOK_SECRET is not valid base64: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_samsara_webhook(
        raw_body,
        request.headers.get("x-samsara-signature"),
        request.headers.get("x-samsara-timestamp"),
        secret,
    ):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(payload, raw_body)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
