# Generated with: spotdraft-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""SpotDraft webhook receiver for FastAPI.

SpotDraft signs each webhook with one header:
  X-SD-WEBHOOK-CONTENT-HASH: <hex HMAC-SHA512 of the raw body>
The key is the hmac_key from GET /api/v2.1/public/webhooks/hmac_key/. It's
base64: decode it to get the HMAC key.
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

logger = logging.getLogger("spotdraft-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SpotDraft Webhook Handler")


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


def _hex_bytes(value: Optional[str]) -> Optional[bytes]:
    value = (value or "").strip()
    if not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", value):
        return None
    return bytes.fromhex(value)


def verify_spotdraft_webhook(
    raw_body: Union[bytes, str],
    content_hash: Optional[str],
    hmac_key: Optional[str],
) -> bool:
    """Check X-SD-WEBHOOK-CONTENT-HASH against the raw body."""
    key = decode_base64_secret(hmac_key)
    given = _hex_bytes(content_hash)
    if key is None or given is None:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(given, expected)


def handle_event(payload: Any, raw_body: bytes) -> Dict[str, Any]:
    """SpotDraft's webhook guides don't publish the payload fields, so this
    example assumes none. Log the top-level keys of the first real delivery,
    then dispatch on the field that carries the activity (CONTRACT_CREATED,
    CONTRACT_EXECUTED, ...). A hash of the raw body is a dedupe fingerprint
    that doesn't depend on field names."""
    fields = list(payload.keys()) if isinstance(payload, dict) else []
    fingerprint = hashlib.sha256(raw_body).hexdigest()
    logger.info("SpotDraft webhook %s with fields: %s", fingerprint[:16], ", ".join(fields))
    return {"received": True}


@app.post("/webhooks/spotdraft")
async def spotdraft_webhook(request: Request):
    secret = os.environ.get("SPOTDRAFT_HMAC_KEY")
    if not secret:
        logger.error("SPOTDRAFT_HMAC_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_base64_secret(secret) is None:
        logger.error("SPOTDRAFT_HMAC_KEY is not valid base64: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_spotdraft_webhook(raw_body, request.headers.get("x-sd-webhook-content-hash"), secret):
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
