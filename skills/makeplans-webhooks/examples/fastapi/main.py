# Generated with: makeplans-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""MakePlans webhook receiver for FastAPI.

MakePlans signs webhooks with X-MakePlans-Signature: "sha256=" + HMAC-SHA256 of
the request body, keyed with your Account secret (shown on the Webhooks page; it
is not the API key). Hex is inferred from the docs example.
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

logger = logging.getLogger("makeplans-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="MakePlans Webhook Handler")


def verify_makeplans_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-MakePlans-Signature against the exact bytes MakePlans sent."""
    key = (secret or "").strip()
    # SHA-256 is 32 bytes: 64 hex characters.
    match = re.fullmatch(r"sha256=([0-9a-fA-F]{64})", (signature or "").strip())
    if not key or not match:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Body: event, idempotency_id (dedupe on it), generated_at, performed_by and
    data {object, id, <object type>}. The root copies of object/id are legacy."""
    name = event.get("event") or ""
    data = event.get("data") or {}
    if name.startswith("booking."):
        logger.info("%s: booking %s", name, data.get("id"))
    elif name.startswith("person."):
        logger.info("%s: person %s", name, data.get("id"))
    elif name.startswith("event."):
        logger.info("%s: event %s", name, data.get("id"))
    elif name == "message.processed":
        logger.info("Message %s processed", data.get("id"))
    else:
        logger.info("Unhandled MakePlans event: %s", name)
    return {"received": True, "event_type": event.get("event"), "event_id": event.get("idempotency_id")}


@app.post("/webhooks/makeplans")
async def makeplans_webhook(request: Request):
    secret = os.environ.get("MAKEPLANS_ACCOUNT_SECRET", "")
    if not secret.strip():
        logger.error("MAKEPLANS_ACCOUNT_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_makeplans_signature(raw_body, request.headers.get("x-makeplans-signature"), secret):
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
