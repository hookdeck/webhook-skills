# Generated with: fedex-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""FedEx webhook receiver for FastAPI.

FedEx Advanced Integrated Visibility webhooks carry fdx-signature: the base64
HMAC-SHA256 of the payload, keyed with the security token set on the webhook.
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

logger = logging.getLogger("fedex-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="FedEx Webhook Handler")


def verify_fedex_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify fdx-signature against the exact bytes FedEx sent."""
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
    """The body is tracking data for one shipment event, in the schema you can
    download from the FedEx Developer Portal. Map the fields you need from it."""
    logger.info("FedEx tracking notification with fields: %s", ", ".join(event.keys()))
    return {"received": True}


@app.post("/webhooks/fedex")
async def fedex_webhook(request: Request):
    secret = os.environ.get("FEDEX_WEBHOOK_SECURITY_TOKEN", "")
    if not secret.strip():
        logger.error("FEDEX_WEBHOOK_SECURITY_TOKEN is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_fedex_signature(raw_body, request.headers.get("fdx-signature"), secret):
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
