# Generated with: khipu-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
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

logger = logging.getLogger("khipu-webhooks")
app = FastAPI()

# Khipu (notifications API 3.0) signs every delivery in x-khipu-signature: "t=<unix ms>,s=<base64>".
# s is standard padded base64 of HMAC-SHA256 over "<t>.<raw body>", keyed with the merchant secret.
# https://docs.khipu.com/en/payment-solutions/instant-payments/payment-webhook

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set KHIPU_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("KHIPU_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "KHIPU_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


tolerance_seconds()  # surface an invalid value at startup

SIGNATURE_RE = re.compile(rb"[A-Za-z0-9+/]{43}=")


def parse_signature_header(header: str):
    """'t=1711965600393,s=<base64>' -> ('1711965600393', ['<base64>'])"""
    timestamp = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "s":
            signatures.append(value)
    return timestamp, signatures


def verify_khipu(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False

    timestamp, signatures = parse_signature_header(signature_header)
    if not timestamp or not signatures:
        return False

    # t is Unix milliseconds. Opt-in only: off unless KHIPU_WEBHOOK_TOLERANCE_SECONDS > 0.
    tolerance = tolerance_seconds()
    if tolerance > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(time.time() * 1000 - int(timestamp)) > tolerance * 1000:
            return False

    # Signed message is bytes: the t string exactly as sent, ".", then the raw body.
    digest = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)

    # Any s= entry may match (several can be present). Validate the format, then compare the
    # strings as bytes in constant time; never decode the received value.
    for sig in signatures:
        sig_bytes = sig.encode()
        if SIGNATURE_RE.fullmatch(sig_bytes) and hmac.compare_digest(sig_bytes, expected):
            return True
    return False


@app.post("/webhooks/khipu")
async def khipu_webhook(request: Request):
    secret = os.getenv("KHIPU_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("KHIPU_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers exactly what Khipu sent, so verify before parsing JSON.
    raw_body = await request.body()
    if not verify_khipu(raw_body, request.headers.get("x-khipu-signature"), secret):
        logger.error("Khipu webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payment = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payment, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # There is no event name: every verified POST is a reconciled payment.
    # Use payment_id for idempotency (see webhook-handler-patterns).
    logger.info(
        "Payment %s reconciled: %s %s via %s (%s)",
        payment.get("payment_id"),
        payment.get("amount"),
        payment.get("currency"),
        payment.get("payment_method"),
        payment.get("subject"),
    )

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
