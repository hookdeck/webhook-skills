# Generated with: employment-hero-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Employment Hero webhook receiver for FastAPI.

Employment Hero signs each webhook with two headers:
  X-EmploymentHero-Timestamp: <timestamp>
  X-EmploymentHero-Signature: <base64 HMAC-SHA256 of "<timestamp>.<raw body>">
The secret key from the Developer Portal is base64: decode it to get the HMAC key.
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

logger = logging.getLogger("employment-hero-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Employment Hero Webhook Handler")


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


def verify_employment_hero_webhook(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Check X-EmploymentHero-Signature against the timestamp and raw body."""
    key = decode_base64_secret(secret)
    if key is None or not signature or not timestamp:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    digest = hmac.new(key, timestamp.encode("utf-8") + b"." + raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Employment Hero's sample compares the base64 strings (secure_compare).
    return hmac.compare_digest(signature.strip().encode("utf-8"), expected)


def handle_event(payload: Any, raw_body: bytes) -> Dict[str, Any]:
    """Employment Hero lists its event names (Employee Created, Leave Request
    Approved, ...) but doesn't publish a payload sample, so this example assumes
    no field. Log the top-level keys of the first real delivery, then dispatch on
    the field that names the event. A hash of the raw body makes a dedupe key
    that doesn't depend on the payload's fields (Employment Hero retries up to
    3 times)."""
    fields = list(payload.keys()) if isinstance(payload, dict) else []
    dedupe_key = hashlib.sha256(raw_body).hexdigest()
    logger.info("Employment Hero webhook %s with fields: %s", dedupe_key[:16], ", ".join(fields))
    return {"received": True}


@app.post("/webhooks/employment-hero")
async def employment_hero_webhook(request: Request):
    secret = os.environ.get("EMPLOYMENT_HERO_WEBHOOK_SECRET")
    if not secret:
        logger.error("EMPLOYMENT_HERO_WEBHOOK_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if decode_base64_secret(secret) is None:
        logger.error("EMPLOYMENT_HERO_WEBHOOK_SECRET is not valid base64: check the value you configured")
        return JSONResponse({"error": "Webhook secret is not valid base64"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_employment_hero_webhook(
        raw_body,
        request.headers.get("x-employmenthero-signature"),
        request.headers.get("x-employmenthero-timestamp"),
        secret,
    ):
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
