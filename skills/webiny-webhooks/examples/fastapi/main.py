# Generated with: webiny-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Webiny webhook receiver for FastAPI.

Webiny 6 signs webhooks with Standard Webhooks headers:
  webhook-id         message ID (the background task ID, stable across retries)
  webhook-timestamp  Unix seconds
  webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
Signed content: f"{id}.{timestamp}." + raw body bytes
Key: the admin-entered secret's raw UTF-8 bytes. Only a secret that already
starts with `whsec_` is treated as Standard Webhooks base64.

Do NOT use the standardwebhooks or svix libraries: they base64-decode the
secret, so a free-text Webiny secret would produce the wrong key.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Any, Dict, Mapping, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("webiny-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Webiny Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# Retries reuse the same webhook-id.
processed_message_ids: set = set()

TIMESTAMP_RE = re.compile(r"^[1-9][0-9]*$")


def resolve_key(secret: Optional[str]) -> Optional[bytes]:
    """Resolve the HMAC key from the secret as entered in Webiny. None = unusable."""
    if not secret:
        return None
    if secret.startswith("whsec_"):
        try:
            key = base64.b64decode(secret[len("whsec_"):])
        except ValueError:
            return None
    else:
        key = secret.encode("utf-8")
    return key or None  # an empty key is never accepted


def read_signature_headers(headers: Mapping[str, str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Read the webhook-* headers; fall back to svix-* when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


def verify_webiny_webhook(
    raw_body: bytes,
    headers: Mapping[str, str],
    secret: Optional[str],
    tolerance_seconds: int = 0,
) -> Tuple[bool, Optional[str]]:
    """Verify a Webiny delivery. Returns (valid, error)."""
    key = resolve_key(secret)
    if key is None:
        return False, "Signing secret missing or empty"

    msg_id, timestamp, signature = read_signature_headers(headers)
    if not msg_id or not timestamp or not signature:
        return False, "Missing signature headers"
    if not TIMESTAMP_RE.match(timestamp):
        return False, "Invalid timestamp"

    if tolerance_seconds > 0 and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False, "Timestamp outside tolerance"

    expected = hmac.new(
        key, f"{msg_id}.{timestamp}.".encode("utf-8") + raw_body, hashlib.sha256
    ).digest()

    # Accept any v1 entry that matches; ignore other versions (v1a, ...).
    for entry in signature.split(" "):
        version, _, value = entry.partition(",")
        if version != "v1" or not value:
            continue
        try:
            received = base64.b64decode(value, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(received, expected):
            return True, None
    return False, "Signature mismatch"


def handle_event(envelope: Dict[str, Any]) -> None:
    """Envelope: {id, event, timestamp, webhookId, deliveryId, tenant, data}.

    Event names are registered at runtime by the installed Webiny apps and shown
    in the admin, so dispatch on the envelope's `event` string.
    """
    event = envelope.get("event")
    logger.info(
        'Webiny event "%s" (tenant %s, webhook %s, delivery %s)',
        event, envelope.get("tenant"), envelope.get("webhookId"), envelope.get("deliveryId"),
    )
    # Add branches for the events you subscribed to in the Webiny admin.
    logger.info("Event data: %s", json.dumps(envelope.get("data")))


@app.post("/webhooks/webiny")
async def webiny_webhook(request: Request):
    secret = os.environ.get("WEBINY_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("WEBINY_WEBHOOK_SECRET is not set; rejecting delivery")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    raw_body = await request.body()  # exact bytes; verify before parsing
    try:
        tolerance = int(os.environ.get("WEBINY_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0

    valid, error = verify_webiny_webhook(raw_body, request.headers, secret, tolerance)
    if not valid:
        logger.error("Webiny webhook verification failed: %s", error)
        return JSONResponse({"error": error}, status_code=400)

    try:
        envelope = json.loads(raw_body)  # parse only after verifying
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message_id = read_signature_headers(request.headers)[0]
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(envelope)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Webiny event")
        return JSONResponse({"error": "Internal server error"}, status_code=500)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
