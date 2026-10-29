# Generated with: bitculator-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("bitculator-webhooks")
app = FastAPI()

# Bitculator signs every delivery:
#   X-Bitculator-Signature: t=<unix seconds>,v1=<hex>
# v1 = HMAC-SHA256 of "<t>.<raw body>" in hex, keyed with the whole secret string's UTF-8 bytes
# (the whsec_ prefix included; not base64-decoded). <t> is used exactly as it appears in the header.
# https://bitculator.com/en/documentation/api/v1

# Optional replay window in seconds, off by default (unset or 0). Bitculator's own example accepts a
# delivery only when |now - t| < 300; set BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=300 to match that when
# Bitculator calls you directly. Behind Hookdeck leave it off: Hookdeck retries and replays resend
# the original timestamp, so a window rejects legitimate redeliveries.
# An invalid value leaves the check off, with a warning.
DEFAULT_TOLERANCE_SECONDS = 0
_warned_invalid_tolerance = False


def tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("BITCULATOR_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_TOLERANCE_SECONDS
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; "
                "the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return DEFAULT_TOLERANCE_SECONDS
    return int(raw)


tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=123,v1=abc' -> ('123', ['abc']); accepts any number of v1 entries, ignores other keys."""
    t, v1 = None, []
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            t = value
        elif key == "v1":
            v1.append(value)
    return t, v1


def verify_bitculator(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    t, v1 = parse_signature_header(signature_header)
    if not t or not re.fullmatch(r"[0-9]+", t):
        return False

    tolerance = tolerance_seconds()
    if tolerance > 0 and not abs(int(time.time()) - int(t)) < tolerance:
        return False

    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()

    def matches(sig: str) -> bool:
        # Exactly 64 hex characters (case-insensitive) before comparing; bytes, never str
        if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
            return False
        return hmac.compare_digest(sig.lower().encode(), expected)

    return any(matches(sig) for sig in v1)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("BITCULATOR_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("BITCULATOR_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-bitculator-signature")
    raw_body = await request.body()
    if not signature or not verify_bitculator(raw_body, signature, secret):
        logger.error("Bitculator webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")
    return raw_body


def _str(x: Any) -> Optional[str]:
    return x if isinstance(x, str) else None


@app.post("/webhooks/bitculator")
async def bitculator_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    # X-Bitculator-Event names the event (alarm.triggered). It is NOT covered by the signature, so read
    # it only after verifying and use it as a routing label. Without it, assume alarm.triggered, the
    # only event Bitculator offers. Acknowledge and skip events this handler doesn't know.
    event_type = request.headers.get("x-bitculator-event") or "alarm.triggered"
    if event_type != "alarm.triggered":
        logger.info("Skipping unhandled event: %s", event_type)
        return {"received": True}

    # The body is documented as JSON, but its fields are not (only `test: true` on test deliveries):
    # parse defensively and don't depend on any field.
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        logger.info("Verified Bitculator delivery with a non-JSON body")
        return {"received": True}
    if not isinstance(event, dict):
        logger.info("Verified Bitculator delivery whose JSON body is not an object")
        return {"received": True}

    # `test: true` marks a delivery from POST /api/v1/webhooks/{id}/test.
    is_test = event.get("test") is True
    # Illustrative shape: data.alarm mirrors an item of GET /api/v1/alarms. Check every type.
    data = event.get("data")
    alarm = data.get("alarm") if isinstance(data, dict) else None
    alarm = alarm if isinstance(alarm, dict) else {}
    coin = alarm.get("coin") if isinstance(alarm.get("coin"), dict) else {}
    parts = [_str(coin.get("symbol")), _str(alarm.get("direction")), _str(alarm.get("target"))]
    logger.info(
        "%salarm triggered: %s %s",
        "Test " if is_test else "",
        _str(alarm.get("name")) or "(unnamed)",
        " ".join(p for p in parts if p),
    )
    # TODO: notify, trade or update dashboards; deduplicate, since deliveries are retried

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
