# Generated with: close-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Close webhook receiver for FastAPI.

Close (close.com) signs each webhook with two headers:
  close-sig-timestamp: <unix seconds>
  close-sig-hash: <hex HMAC-SHA256 of timestamp + raw body, no delimiter>
The subscription's signature_key is HEX: decode it to get the HMAC key.
(Decoding it as base64 also "works" and gives 48 wrong bytes.)
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

logger = logging.getLogger("close-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Close Webhook Handler")


def decode_hex_secret(secret: Optional[str]) -> Optional[bytes]:
    """The key is issued hex-encoded: the HMAC key is its decoded bytes.

    Surrounding whitespace (a pasted trailing newline) is trimmed.
    """
    value = (secret or "").strip()
    if not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", value):
        return None
    return bytes.fromhex(value)


def _hex_bytes(value: Optional[str]) -> Optional[bytes]:
    value = (value or "").strip()
    if not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", value):
        return None
    return bytes.fromhex(value)


def verify_close_webhook(
    raw_body: Union[bytes, str],
    sig_hash: Optional[str],
    timestamp: Optional[str],
    signature_key: Optional[str],
) -> bool:
    """Check close-sig-hash against close-sig-timestamp + the raw body."""
    key = decode_hex_secret(signature_key)
    given = _hex_bytes(sig_hash)
    if key is None or given is None or not timestamp:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    # The timestamp and the body are concatenated with no delimiter.
    expected = hmac.new(key, timestamp.encode("utf-8") + raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(given, expected)


def handle_event(payload: Any, raw_body: bytes = b"") -> Dict[str, Any]:
    """Close posts {subscription_id, event}. The event has id, object_type,
    action, object_id, lead_id, changed_fields, data and previous_data."""
    event = payload.get("event") if isinstance(payload, dict) else None
    event = event if isinstance(event, dict) else {}
    name = f"{event.get('object_type')}.{event.get('action')}"
    if name == "lead.created":
        logger.info("Close lead created: %s", event.get("object_id"))
    elif name == "opportunity.updated":
        changed = ", ".join(event.get("changed_fields") or [])
        logger.info("Close opportunity %s changed: %s", event.get("object_id"), changed)
    else:
        logger.info("Close %s event %s", name, event.get("id"))
    # Close retries for up to 72 hours: use event.id to skip duplicates.
    return {"received": True, "event": name}


@app.post("/webhooks/close")
async def close_webhook(request: Request):
    secret = os.environ.get("CLOSE_WEBHOOK_SIGNATURE_KEY")
    if not secret:
        logger.error("CLOSE_WEBHOOK_SIGNATURE_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_hex_secret(secret) is None:
        logger.error("CLOSE_WEBHOOK_SIGNATURE_KEY is not valid hex: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid hex"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_close_webhook(
        raw_body,
        request.headers.get("close-sig-hash"),
        request.headers.get("close-sig-timestamp"),
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
