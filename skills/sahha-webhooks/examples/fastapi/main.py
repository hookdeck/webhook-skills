# Generated with: sahha-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

logger = logging.getLogger("sahha_webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Sahha signs every delivery with:
#   X-Signature   lowercase hex HMAC-SHA256 of the raw request body (no prefix)
#   X-Event-Type  e.g. ScoreCreatedIntegrationEvent
#   X-External-Id the profile's external identifier in your system
# The key is the Dashboard secret as UTF-8 bytes. Only the body is signed, so
# there is no timestamp to check.

SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{64}")


def verify_sahha_signature(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    """Verify X-Signature over the raw body bytes."""
    # Validate before decoding: exactly 64 hex characters.
    if not signature or not SIGNATURE_PATTERN.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    provided = bytes.fromhex(signature)
    # compare_digest on bytes; hex is case-insensitive, decoding handles that.
    return hmac.compare_digest(provided, expected)


async def verified_body(
    request: Request,
    x_signature: Optional[str] = Header(default=None),
) -> bytes:
    """Dependency: return the raw body only if the signature is valid."""
    secret = os.environ.get("SAHHA_WEBHOOK_SECRET")
    if not secret:
        logger.error("SAHHA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()  # exact bytes; never request.json() first
    if not verify_sahha_signature(raw_body, x_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


def _str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


# Every field of the parsed body is untrusted: check types before reading.
def handle_event(event_type: str, external_id: Optional[str], payload: dict) -> None:
    if event_type == "ScoreCreatedIntegrationEvent":
        logger.info("Score for %s: %s = %s (%s)", external_id, _str(payload.get("type")),
                    payload.get("score"), _str(payload.get("state")))
    elif event_type == "BiomarkerCreatedIntegrationEvent":
        logger.info("Biomarker for %s: %s = %s %s", external_id, _str(payload.get("type")),
                    _str(payload.get("value")), _str(payload.get("unit")) or "")
    elif event_type == "ArchetypeCreatedIntegrationEvent":
        logger.info("Archetype for %s: %s = %s", external_id, _str(payload.get("name")),
                    _str(payload.get("value")))
    elif event_type == "TagReceivedIntegrationEvent":
        logger.info("Tag for %s: %s (%s)", external_id, _str(payload.get("name")),
                    _str(payload.get("type")))
    elif event_type == "DataLogReceivedIntegrationEvent":
        logs = payload.get("dataLogs")
        count = len([x for x in logs if isinstance(x, dict)]) if isinstance(logs, list) else 0
        logger.info("Data logs for %s: %d %s sample(s)", external_id, count,
                    _str(payload.get("dataType")))
    else:
        logger.info("Unhandled Sahha event type: %s", event_type)


@app.post("/webhooks/sahha")
async def sahha_webhook(
    raw_body: bytes = Depends(verified_body),
    x_event_type: Optional[str] = Header(default=None),
    x_external_id: Optional[str] = Header(default=None),
):
    # Parse only after the signature check.
    try:
        payload = json.loads(raw_body)
    except (ValueError, RecursionError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Unexpected payload shape")

    if not x_event_type:
        raise HTTPException(status_code=400, detail="Missing X-Event-Type header")

    try:
        # Sahha needs a 2xx within 30 seconds; enqueue heavy work in production.
        # Retries and out-of-order delivery are possible: make handlers idempotent.
        handle_event(x_event_type, x_external_id or _str(payload.get("externalId")), payload)
    except Exception:
        logger.exception("Error handling Sahha event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
