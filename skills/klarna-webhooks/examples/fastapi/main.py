# Generated with: klarna-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Klarna webhook receiver for FastAPI.

Klarna Notifications API webhooks carry Klarna-Signature: the lowercase hex
HMAC-SHA256 of the raw body, keyed with the signing key as UTF-8 text.
Klarna-Signing-Key-Id names the key.
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

logger = logging.getLogger("klarna-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Klarna Webhook Handler")


def verify_klarna_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify Klarna-Signature against the exact bytes Klarna sent."""
    key = (secret or "").strip()
    # SHA-256 is 32 bytes: 64 hex characters.
    match = re.fullmatch(r"([0-9a-fA-F]{64})", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Body: {metadata: {event_id, event_type, event_version, ...}, payload: {...}}.
    Store keyed on metadata.event_id, acknowledge with a 2xx, then process
    asynchronously. A repeated event_id is a retry."""
    metadata = event.get("metadata") or {}
    event_type = metadata.get("event_type") or ""
    if event_type.startswith("payment.request.state-change."):
        logger.info("Payment request %s: %s", (event.get("payload") or {}).get("payment_request_id"), event_type.rsplit(".", 1)[-1])
    else:
        logger.info("Klarna event %s (%s)", event_type, metadata.get("event_version"))
    return {"received": True, "event_type": metadata.get("event_type"), "event_id": metadata.get("event_id")}


@app.post("/webhooks/klarna")
async def klarna_webhook(request: Request):
    secret = os.environ.get("KLARNA_SIGNING_KEY", "")
    if not secret.strip():
        logger.error("KLARNA_SIGNING_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_klarna_signature(raw_body, request.headers.get("klarna-signature"), secret):
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
