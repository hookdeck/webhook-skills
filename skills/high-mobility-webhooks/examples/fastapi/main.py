# Generated with: high-mobility-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("high-mobility-webhooks")
app = FastAPI()

# High Mobility signs every delivery:
#   X-HM-Signature-256: sha256=<lowercase hex>
# = HMAC-SHA256 of the raw body bytes only, keyed with the webhook secret's UTF-8 bytes as-is.
# The deprecated X-HM-Signature (HMAC-SHA1) is ignored.
# https://docs.high-mobility.com/docs/webhooks

PREFIX = "sha256="
DIGEST_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_high_mobility(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False
    sig = signature_header.strip()
    if sig[: len(PREFIX)].lower() == PREFIX:
        sig = sig[len(PREFIX):]  # bare digest is accepted too
    if not DIGEST_RE.fullmatch(sig):  # validate before comparing
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # compare_digest on bytes, never str (a non-ASCII str would raise)
    return hmac.compare_digest(sig.lower().encode(), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body (empty for a request without one) and verify it first."""
    secret = os.getenv("HIGH_MOBILITY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("HIGH_MOBILITY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    signature = request.headers.get("x-hm-signature-256")
    if not signature or not verify_high_mobility(raw_body, signature, secret):
        logger.error("High Mobility webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")
    return raw_body


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _str(value):
    return value if isinstance(value, str) else None


# High Mobility's docs don't name the HTTP method, so accept all of these.
@app.api_route("/webhooks/high-mobility", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def high_mobility_webhook(raw_body: bytes = Depends(verified_body)):
    # Verified and empty (e.g. a GET): acknowledge.
    if not raw_body:
        return {"received": True}

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Everything in the body is untrusted: check each nested value's type before reading it.
    # Duplicates and out-of-order deliveries are possible, so keep handlers idempotent.
    event = _dict(body.get("event"))
    vehicle = _dict(body.get("vehicle"))
    event_type = _str(event.get("type"))

    if event_type == "fleet_clearance_changed":
        logger.info(
            "Fleet clearance changed for %s: %s %s",
            _str(vehicle.get("vin")),
            _str(event.get("action")),
            _str(event.get("detail")) or "",
        )
    elif event_type == "ping":
        logger.info("Ping received (webhook configuration changed)")
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
