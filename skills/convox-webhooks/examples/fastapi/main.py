# Generated with: convox-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

logger = logging.getLogger("convox-webhooks")
app = FastAPI()

# Convox signs every webhook once the `webhook_signing_key` Rack parameter is set:
#   Convox-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]
# v1 = HMAC-SHA256 of "<t>.<raw body>" as lowercase hex, keyed with the signing key's UTF-8
# bytes as-is (never hex-decoded, even if you generated it with `openssl rand -hex 32`).
# One v1 per active key (up to 4) during rotation: accept the delivery if ANY of them matches.
# https://docs.convox.com/console/webhook-signing

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}", re.ASCII)
DIGITS = re.compile(r"[0-9]+", re.ASCII)

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set CONVOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("CONVOX_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "CONVOX_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str) -> Tuple[Optional[str], List[str]]:
    """Return (t, [v1, ...]). t stays a string: it goes into the signed message untouched.
    Other keys (v0, ...) are ignored."""
    t: Optional[str] = None
    sigs: List[str] = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            sigs.append(value)
    return t, sigs


def verify_convox(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, sigs = parse_signature_header(signature_header)
    if not t or not DIGITS.fullmatch(t):
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False

    # Check the format before decoding
    candidates = [s for s in sigs if HEX_SHA256.fullmatch(s)]
    if not candidates:
        return False

    signed = t.encode() + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return any(hmac.compare_digest(bytes.fromhex(s), expected) for s in candidates)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("CONVOX_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("CONVOX_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_convox(raw_body, request.headers.get("convox-signature", ""), secret):
        logger.error("Convox webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/convox")
async def convox_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    action = event.get("action")
    status = event.get("status")
    data = _as_dict(event.get("data"))

    # Delivery is best-effort and never retried; events can arrive out of order or twice.
    # Order by event["timestamp"] and dedupe on data["tick_id"] + event["action"].
    if action == "app:create":
        logger.info("App created: %s", data.get("app"))
    elif action == "build:create":
        if status == "error":
            logger.info("Build failed for %s: %s", data.get("app"), data.get("message"))
        else:
            logger.info("Build started for %s", data.get("app"))
    elif action == "release:promote":
        logger.info("Promote started for %s", data.get("app"))
    elif action == "app:budget:cap":
        logger.info("Budget cap crossed for %s", data.get("app"))
    elif action == "app:budget:auto-shutdown:fired":
        logger.info("Auto-shutdown fired for %s", data.get("app"))
    elif action == "app:budget:auto-shutdown:cancelled":
        logger.info("Auto-shutdown cancelled for %s: %s", data.get("app"), data.get("cancel_reason"))
    else:
        # The docs say to ignore unknown actions (35 documented, more may follow)
        logger.info("Unhandled action: %s", action)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
