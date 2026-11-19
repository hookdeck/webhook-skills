# Generated with: bitgo-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""BitGo webhook receiver for FastAPI.

BitGo signs notifications with X-Signature-SHA256 (64 lowercase hex characters) once
the enterprise has a webhook secret. BitGo documents verifying it only through its
verify API; the local check here (hex HMAC-SHA256 of the raw body keyed with the
secret as text) is inferred.
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

logger = logging.getLogger("bitgo-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BitGo Webhook Handler")


def verify_bitgo_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Signature-SHA256 against the exact bytes BitGo sent."""
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
    """The body names the webhook type and the wallet. BitGo recommends fetching
    the transfer (or block) from its API before acting on a notification."""
    kind = event.get("type")
    if kind == "transfer":
        logger.info("Transfer %s on wallet %s: %s", event.get("transfer"), event.get("wallet"), event.get("state"))
    elif kind == "pendingapproval":
        logger.info("Pending approval on wallet %s", event.get("wallet"))
    else:
        logger.info("BitGo %s webhook", kind)
    return {"received": True, "type": kind, "wallet": event.get("wallet")}


@app.post("/webhooks/bitgo")
async def bitgo_webhook(request: Request):
    secret = os.environ.get("BITGO_WEBHOOK_SECRET", "")
    if not secret.strip():
        logger.error("BITGO_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_bitgo_signature(raw_body, request.headers.get("x-signature-sha256"), secret):
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
