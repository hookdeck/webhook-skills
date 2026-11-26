# Generated with: kontent-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Kontent.ai webhook receiver for FastAPI.

Kontent.ai signs webhooks with X-Kontent-ai-Signature: the base64 HMAC-SHA256 of the
raw body, keyed with the webhook's Secret as text (not base64-decoded).
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

logger = logging.getLogger("kontent-ai-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Kontent.ai Webhook Handler")


def verify_kontent_ai_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Kontent-ai-Signature against the exact bytes Kontent.ai sent."""
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
    """Body: {notifications: [{data: {system}, message}]}. Each notification names one
    changed object and the event (object_type, action, delivery_slot). Notifications
    can arrive in batches."""
    notifications = event.get("notifications")
    if not isinstance(notifications, list):
        notifications = []
    for notification in notifications:
        system = (notification.get("data") or {}).get("system") or {}
        message = notification.get("message") or {}
        logger.info("%s %s: %s (%s)", message.get("object_type"), system.get("codename"),
                    message.get("action"), message.get("delivery_slot"))
    return {"received": True, "notifications": len(notifications)}


@app.post("/webhooks/kontent-ai")
async def kontent_ai_webhook(request: Request):
    secret = os.environ.get("KONTENT_AI_WEBHOOK_SECRET", "")
    if not secret.strip():
        logger.error("KONTENT_AI_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_kontent_ai_signature(raw_body, request.headers.get("x-kontent-ai-signature"), secret):
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
