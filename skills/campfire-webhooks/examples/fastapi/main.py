# Generated with: campfire-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_campfire_signature(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Campfire webhook delivery.

    Signed message (bytes): `{Campfire-Webhook-Request-Timestamp}:{raw body}`
    (a colon, not a dot). HMAC-SHA256 keyed with the signing secret as UTF-8;
    the bare hex digest (no prefix) is in `Campfire-Webhook-Signature-v1`.
    """
    if not secret or not timestamp or not signature:
        return False

    # Validate the format before decoding the digest.
    if not HEX_DIGEST.fullmatch(signature):
        return False

    if tolerance_seconds > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    # Header values are latin-1 on the wire; sign them exactly as received.
    message = b"".join([timestamp.encode("latin-1"), b":", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # validated above: 32 bytes

    return hmac.compare_digest(expected, received)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/campfire")
async def campfire_webhook(request: Request):
    # Raw bytes, read before any parsing: the signature covers them exactly.
    raw_body = await request.body()
    try:
        tolerance = int(os.getenv("CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0

    if not verify_campfire_signature(
        raw_body,
        request.headers.get("campfire-webhook-request-timestamp"),
        request.headers.get("campfire-webhook-signature-v1"),
        os.getenv("CAMPFIRE_WEBHOOK_SECRET"),
        tolerance,
    ):
        print("Campfire webhook signature verification failed")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Campfire sends {webhook_uuid, topic, data, changes}. *.deleted topics
    # carry only {"id": ...} in data and null in changes.
    topic = event.get("topic")
    data = _as_dict(event.get("data"))

    if topic == "Invoice.created":
        print(f"Invoice created: {data.get('id')} ({data.get('invoice_number')})")
    elif topic == "Invoice.payment":
        # Fires on every increase in amount paid, including partial payments.
        print(f"Invoice payment: {data.get('id')}, amount paid {data.get('amount_paid')}")
    elif topic == "Invoice.paid":
        # Fully paid. Campfire also sends Invoice.payment and no Invoice.updated.
        print(f"Invoice paid: {data.get('id')}")
    elif topic == "Bill.created":
        print(f"Bill created: {data.get('id')}")
    elif topic == "Bill.paid":
        print(f"Bill paid: {data.get('id')}")
    elif topic == "JournalEntry.created":
        print(f"Journal entry created: {data.get('id')}")
    elif topic in ("Invoice.deleted", "Bill.deleted"):
        print(f"{topic}: {data.get('id')}")
    else:
        print(f"Unhandled Campfire topic: {topic}")

    # Deliveries are unordered and can repeat: treat data as the latest state of
    # the object, and acknowledge fast (2xx) before doing slow work.
    return {"received": True}
