# Generated with: socotra-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Socotra webhook receiver for FastAPI.

SOCOTRA WEBHOOK VERIFICATION

  header    : socotra-signature: t=<unix ms>,v1=<hex>[,v1=<hex>...]
  algorithm : HMAC-SHA256, lowercase hex
  signed    : the t value exactly as sent (a string), ".", then the RAW body bytes
  key       : the endpoint `secret`, used as UTF-8 bytes
  tag       : leave the endpoint's `tag` unset. A tagged endpoint signs
              `{t}.{body}.{tag}`, which this check (and Hookdeck) cannot verify.
"""

import hmac
import hashlib
import json
import logging
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("socotra-webhooks")

app = FastAPI(title="Socotra Webhook Handler")

SIGNATURE_HEX = re.compile(r"^[0-9a-fA-F]{64}$")


def parse_signature_header(header: Optional[str]):
    """Split `t=...,v1=...,v1=...` into the timestamp string and every v1 value.
    Other keys (v0, tag, ...) are ignored."""
    timestamp: Optional[str] = None
    signatures = []
    for part in (header or "").split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    return timestamp, signatures


def verify_socotra_signature(
    raw_body: bytes,
    header: Optional[str],
    secret: Optional[str],
    tolerance_seconds: float = 0,
) -> bool:
    """True only when ANY v1= entry equals HMAC-SHA256(secret, f"{t}." + raw_body).

    `tolerance_seconds` is an optional max age for t (Unix milliseconds); 0 = off.
    """
    if not header or not secret:
        return False

    timestamp, signatures = parse_signature_header(header)
    if not timestamp or not signatures:
        return False

    # Signed message as bytes: the t string as sent + "." + the raw body.
    signed_message = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_message, hashlib.sha256).digest()

    valid = False
    for signature in signatures:
        # Validate length and alphabet BEFORE decoding, then compare bytes in constant time.
        if not SIGNATURE_HEX.fullmatch(signature):
            continue
        if hmac.compare_digest(bytes.fromhex(signature), expected):
            valid = True
    if not valid:
        return False

    # Opt-in replay window. t is Unix MILLISECONDS.
    if tolerance_seconds > 0:
        if not timestamp.isascii() or not timestamp.isdigit():
            return False
        if abs(time.time() * 1000 - int(timestamp)) > tolerance_seconds * 1000:
            return False
    return True


def tolerance_seconds() -> float:
    try:
        value = float(os.environ.get("SOCOTRA_WEBHOOK_TOLERANCE_SECONDS", ""))
    except ValueError:
        return 0
    return value if value > 0 else 0


async def verified_socotra_body(request: Request) -> bytes:
    """FastAPI dependency: returns the raw body (b"" when there is none) only if Socotra signed it."""
    # Raw bytes — re-serialising parsed JSON changes them and breaks the signature.
    raw_body = await request.body()
    if not verify_socotra_signature(
        raw_body,
        request.headers.get("socotra-signature"),
        os.environ.get("SOCOTRA_WEBHOOK_SECRET"),
        tolerance_seconds(),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


# Webhooks deliver an EventResponse: {locator, requestId, userLocator, timestamp, type, data}.
# Dispatch on `type`; the full list is on Socotra's Event Definitions page.
def handle_event(event: dict) -> None:
    event_type = event.get("type")
    locator = event.get("locator")
    if event_type == "policy.account.create":
        logger.info("Account created: %s", locator)
    elif event_type == "policy.quote.accept":
        logger.info("Quote accepted: %s", locator)
    elif event_type == "policy.quote.issue":
        logger.info("Quote issued: %s", locator)
    elif event_type == "billing.invoice.generate":
        logger.info("Invoice generated: %s", locator)
    elif event_type == "billing.payment.create":
        logger.info("Payment created: %s", locator)
    elif event_type == "document.ready":
        logger.info("Document ready: %s", locator)
    else:
        logger.info("Unhandled event type: %s", event_type)


# Socotra's docs don't name the HTTP method, so every usual method is accepted.
@app.api_route("/webhooks/socotra", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def socotra_webhook(raw_body: bytes = Depends(verified_socotra_body)):
    # Verified. Nothing to parse for an empty body, so acknowledge it.
    if not raw_body:
        return {"received": True}

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    handle_event(event)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
