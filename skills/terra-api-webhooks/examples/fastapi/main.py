# Generated with: terra-api-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_list(value):
    """A nested JSON array, or [] when the field is missing or another type."""
    return value if isinstance(value, list) else []


load_dotenv()

logger = logging.getLogger("terra-api-webhooks")
app = FastAPI()

# Terra signs every delivery in the terra-signature header:
#   t=<unix seconds>,v1=<hex>[,v0=<hex>]
# v1 is HMAC-SHA256 (lowercase hex) of "<t>.<raw body>", keyed with the destination's signing secret
# (UTF-8 bytes, used as-is). The header can carry several v1 values; any match is enough. Ignore v0.
# https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations/webhooks

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set TERRA_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False

_SIG_RE = re.compile(rb"[0-9a-fA-F]{64}")


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("TERRA_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "TERRA_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=1723808700,v1=<hex>,v0=<hex>' -> ('1723808700', ['<hex>'])"""
    timestamp = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    return timestamp, signatures


def verify_terra(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not signatures:
        return False

    # Opt-in only: off unless TERRA_WEBHOOK_TOLERANCE_SECONDS > 0
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(int(time.time()) - int(timestamp)) > tolerance:
            return False

    # The signed message is bytes: the t string exactly as sent, ".", then the untouched body bytes.
    expected = hmac.new(
        secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256
    ).hexdigest().encode()

    for sig in signatures:
        # Validate length and alphabet before comparing; compare bytes, never str
        sig_bytes = sig.encode()
        if _SIG_RE.fullmatch(sig_bytes) and hmac.compare_digest(sig_bytes.lower(), expected):
            return True
    return False


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw bytes and check terra-signature before anything is parsed."""
    secret = os.getenv("TERRA_WEBHOOK_SECRET")
    if not secret:
        logger.error("TERRA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_terra(raw_body, request.headers.get("terra-signature"), secret):
        logger.error("Terra webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/terra-api")
async def terra_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    user = _as_dict(payload.get("user"))
    event_type = payload.get("type")

    # The event type is the top-level "type" field; "status" qualifies it.
    if event_type == "auth":
        logger.info("User %s connected %s (status: %s)", user.get("user_id"), user.get("provider"), payload.get("status"))
    elif event_type in ("deauth", "access_revoked"):
        logger.info("User %s disconnected (%s)", user.get("user_id"), event_type)
    elif event_type == "user_reauth":
        logger.info("User %s re-authenticated", user.get("user_id"))
    elif event_type == "connection_error":
        logger.error("Connection error for user %s: %s", user.get("user_id"), payload.get("status"))
    elif event_type in ("activity", "sleep", "body", "daily", "athlete"):
        logger.info("%s data for user %s: %d record(s)", event_type, user.get("user_id"), len(_as_list(payload.get("data"))))
    else:
        logger.info("Unhandled event: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
