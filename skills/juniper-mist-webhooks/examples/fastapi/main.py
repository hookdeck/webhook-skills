# Generated with: juniper-mist-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Juniper Mist webhook receiver for FastAPI.

Juniper Mist signs http-post webhooks that have a Secret set with
X-Mist-Signature-v2 (lowercase hex HMAC-SHA256 of the raw body, keyed with the
secret) and the legacy X-Mist-Signature (hex HMAC-SHA1). This example verifies
v2 only.
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

logger = logging.getLogger("juniper-mist-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Juniper Mist Webhook Handler")


def verify_mist_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-Mist-Signature-v2 against the exact bytes Juniper Mist sent."""
    key = (secret or "").strip()
    # SHA-256 is 32 bytes: 64 hex characters.
    match = re.fullmatch(r"([0-9a-fA-F]{64})", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(body: Dict[str, Any]) -> Dict[str, Any]:
    """Every delivery is {topic, events: [...]}. One POST can carry several
    events of the same topic. The event fields depend on the topic."""
    topic = body.get("topic")
    events = body.get("events") if isinstance(body.get("events"), list) else []
    for event in events:
        if topic == "alarms":
            logger.info("Alarm %s (%s) at site %s", event.get("type"), event.get("severity"), event.get("site_id"))
        elif topic == "audits":
            logger.info("Audit: %s by %s", event.get("message"), event.get("admin_name"))
        elif topic in ("device-events", "device-updowns"):
            logger.info("%s: %s on %s", topic, event.get("type"), event.get("device_name") or event.get("mac"))
        else:
            logger.info("Mist %s event", topic)
    return {"received": True, "topic": topic, "events": len(events)}


@app.post("/webhooks/juniper-mist")
async def mist_webhook(request: Request):
    secret = os.environ.get("MIST_WEBHOOK_SECRET", "")
    if not secret.strip():
        logger.error("MIST_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_mist_signature(raw_body, request.headers.get("x-mist-signature-v2"), secret):
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
