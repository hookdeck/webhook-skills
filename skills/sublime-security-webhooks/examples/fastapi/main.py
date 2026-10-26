# Generated with: sublime-security-webhooks skill
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

load_dotenv()

logger = logging.getLogger("sublime-security-webhooks")
app = FastAPI()

# Sublime signs every webhook Action delivery in X-Sublime-Signature:
#   t=1626139320,v0=3d35d777...abaca06
# Each v0 value is the lowercase hex HMAC-SHA256 of "<t>.<raw body>" keyed with the Action's
# signing secret (UTF-8). The header can carry several signatures; accept any v0 match.
# https://docs.sublime.security/docs/webhooks#check-the-webhook-signature

# Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
# original timestamp, so a window would reject late redeliveries. Set
# SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other
# value is treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def parse_signature_header(header: str):
    """'t=1626139320,v0=<hex>' -> ('1626139320', ['<hex>'])"""
    timestamp = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t":
            timestamp = value
        elif key == "v0":
            signatures.append(value)
    return timestamp, signatures


def verify_sublime(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if (
        not timestamp
        or not re.fullmatch(r"[0-9]+", timestamp)
        or int(timestamp) <= 0
        or not signatures
    ):
        return False

    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        return False

    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    # Only well-formed 64-character hex candidates are compared; hex is case-insensitive.
    return any(
        re.fullmatch(r"[0-9a-fA-F]{64}", sig) is not None
        and hmac.compare_digest(sig.lower().encode(), expected.encode())
        for sig in signatures
    )


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("SUBLIME_SECURITY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("SUBLIME_SECURITY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_sublime(raw_body, request.headers.get("x-sublime-signature"), secret):
        logger.error("Sublime Security webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/sublime-security")
async def sublime_security_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # payload["id"] is unique per delivery: use it to drop duplicates (see webhook-handler-patterns)
    event_id = payload.get("id")
    event_type = payload.get("type")
    data = payload.get("data") or {}
    message_id = (data.get("message") or {}).get("id")
    rules = ", ".join(r.get("name", "") for r in data.get("flagged_rules") or [])

    if event_type == "message.flagged":
        logger.info("[%s] Message %s flagged (%s): %s", event_id, message_id, data.get("classification"), rules)
    elif event_type == "group":
        logger.info("[%s] Message group triggered the Action: %s", event_id, rules)
    elif event_type == "manual":
        logger.info("[%s] Message %s sent manually from Sublime", event_id, message_id)
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
