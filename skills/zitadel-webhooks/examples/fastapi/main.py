# Generated with: zitadel-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("zitadel-webhooks")
app = FastAPI()

# ZITADEL Actions v2 targets with the JSON payload type sign every request in the
# ZITADEL-Signature header: "t=<unix seconds>,v1=<hex>" (one v1 per signing key).
# v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw body>", keyed with the target's signingKey (UTF-8 bytes).
# https://zitadel.com/docs/guides/integrate/actions/testing-request-signature
# JWT and JWE payload types are not signed this way and are not covered here.

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set ZITADEL_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("ZITADEL_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "ZITADEL_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=1700000000,v1=<hex>,v1=<hex>,v0=<ignored>' -> ('1700000000', ['<hex>', '<hex>'])

    The timestamp stays a string: it is part of the signed message exactly as sent.
    """
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


def verify_zitadel(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not signatures:
        return False

    # Opt-in only: off unless ZITADEL_WEBHOOK_TOLERANCE_SECONDS > 0.
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance:
            return False

    # Signed message as bytes: "<t>." followed by the raw body bytes, untouched.
    expected = hmac.new(
        secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).digest()

    # A header can carry several v1 entries (key rotation); any one matching is enough.
    for sig in signatures:
        # Validate before decoding: exact length and alphabet.
        if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
            continue
        if hmac.compare_digest(bytes.fromhex(sig), expected):
            return True
    return False


def decode_event_payload(value) -> dict:
    """event_payload is documented as base64-encoded JSON; accept an already-decoded object too."""
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    try:
        decoded = json.loads(base64.b64decode(value, validate=True))
    except (binascii.Error, ValueError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def handle_event(payload: dict, event_type: str) -> None:
    event_payload = decode_event_payload(payload.get("event_payload"))
    agg_type = payload.get("aggregateType")
    agg_id = payload.get("aggregateID")
    aggregate = f"{agg_type if isinstance(agg_type, str) else '?'}/{agg_id if isinstance(agg_id, str) else '?'}"

    if event_type == "user.human.added":
        user_name = event_payload.get("userName")
        logger.info("Human user added (%s): %s", aggregate, user_name if isinstance(user_name, str) else "unknown")
    elif event_type == "session.added":
        logger.info("Session added (%s)", aggregate)
    else:
        logger.info("Unhandled event: %s", event_type)


@app.post("/webhooks/zitadel")
async def zitadel_webhook(request: Request):
    secret = os.getenv("ZITADEL_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("ZITADEL_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers the exact body ZITADEL sent, so read before any JSON parsing.
    raw_body = await request.body()
    if not verify_zitadel(raw_body, request.headers.get("zitadel-signature"), secret):
        logger.error("ZITADEL webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Verified. Everything in the body is still untrusted input: check types before using a field.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Event executions carry event_type, request/response executions carry fullMethod,
    # function executions carry function. Dispatch on whichever is present.
    event_type = payload.get("event_type")
    full_method = payload.get("fullMethod")
    function = payload.get("function")
    if isinstance(event_type, str):
        handle_event(payload, event_type)
    elif isinstance(full_method, str):
        logger.info("Request/response execution: %s", full_method)
    elif isinstance(function, str):
        logger.info("Function execution: %s", function)
    else:
        logger.info("Unhandled ZITADEL payload")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
