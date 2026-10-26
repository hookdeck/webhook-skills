# Generated with: delivereasy-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# Exact 44-char padded standard base64
SIGNATURE_RE = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_delivereasy(raw_body: bytes, signature: Optional[str], api_key: Optional[str]) -> bool:
    """Verify X-Signature: base64(HMAC-SHA256(api_key, raw_body))."""
    if not api_key or not signature or not SIGNATURE_RE.fullmatch(signature):
        return False
    digest = hmac.new(api_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # compare_digest on bytes (str raises on non-ASCII); signature is already validated ASCII
    return hmac.compare_digest(expected, signature.encode("ascii"))


@app.post("/webhooks/delivereasy")
async def delivereasy_webhook(request: Request):
    # Raw bytes: exactly what Delivereasy signed
    raw_body = await request.body()

    if not verify_delivereasy(
        raw_body,
        request.headers.get("x-signature"),
        os.getenv("DELIVEREASY_WEBHOOK_SECRET"),
    ):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        booking = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(booking, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    # The payload is the booking itself; there is no event name. Dispatch on status.
    # Delivery is at least once: deduplicate on booking["id"].
    print(f"Booking {booking.get('id')} ({booking.get('booking_identifier')}) status: {booking.get('status')}")
    # TODO: enqueue for async processing, keyed by id and status

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
