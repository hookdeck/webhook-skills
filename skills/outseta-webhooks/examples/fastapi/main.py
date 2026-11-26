# Generated with: outseta-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Outseta webhook receiver for FastAPI.

Outseta signs webhooks once you add a Webhook Signature Key:
  x-hub-signature-256: sha256=<hex HMAC-SHA256 of the raw body>
The key is 32 bytes you generate, written as HEX (openssl rand -hex 32):
hex-decode it to get the HMAC key. (Decoding it as base64 gives 48 wrong bytes.)
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

logger = logging.getLogger("outseta-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Outseta Webhook Handler")


def decode_hex_secret(secret: Optional[str]) -> Optional[bytes]:
    """The key is issued hex-encoded: the HMAC key is its decoded bytes.

    Surrounding whitespace (a pasted trailing newline) is trimmed.
    """
    value = (secret or "").strip()
    if not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", value):
        return None
    return bytes.fromhex(value)


def verify_outseta_webhook(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    signature_key: Optional[str],
) -> bool:
    """Check x-hub-signature-256 against the raw body."""
    key = decode_hex_secret(signature_key)
    if key is None or not signature:
        return False
    match = re.fullmatch(r"sha256=((?:[0-9a-fA-F]{2})+)", signature.strip())
    if not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(payload: Any, raw_body: bytes = b"") -> Dict[str, Any]:
    """Each Outseta notification posts the record it's about (for example the
    Person for "Person Login"). Outseta's signature article doesn't show a
    payload, so this example only reads Uid if the record has one."""
    uid = payload.get("Uid") if isinstance(payload, dict) else None
    logger.info("Outseta notification for record %s", uid)
    return {"received": True}


@app.post("/webhooks/outseta")
async def outseta_webhook(request: Request):
    secret = os.environ.get("OUTSETA_WEBHOOK_SIGNATURE_KEY")
    if not secret:
        logger.error("OUTSETA_WEBHOOK_SIGNATURE_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_hex_secret(secret) is None:
        logger.error("OUTSETA_WEBHOOK_SIGNATURE_KEY is not valid hex: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid hex"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_outseta_webhook(raw_body, request.headers.get("x-hub-signature-256"), secret):
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
