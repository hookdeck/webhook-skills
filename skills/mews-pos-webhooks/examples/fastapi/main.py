# Generated with: mews-pos-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard Base64 (padded) of a 32-byte digest: 43 characters plus "=".
SIGNATURE_FORMAT = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_mews_pos_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Mews POS signs the raw body with HMAC-SHA256 (key = secret as UTF-8 bytes) and sends
    the bare padded Base64 digest in X-Signature. Nothing else is signed, so there is no
    timestamp to check. The format is validated and decoded strictly before comparing, and
    the Base64 string is compared exactly (a non-canonical encoding of the same bytes fails).
    """
    if secret is None:
        secret = os.environ.get("MEWS_POS_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str) or not SIGNATURE_FORMAT.fullmatch(signature):
        return False
    try:
        base64.b64decode(signature, validate=True)
    except ValueError:
        return False
    expected = base64.b64encode(hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature.encode("ascii"), expected)


def handle_event(event_type: str, data: dict) -> None:
    event_id = data.get("id") if isinstance(data.get("id"), str) else None
    attributes = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}

    if event_type == "booking.status.updated":
        print(f"Booking {event_id} status: {attributes.get('status')}")
        # TODO: update table or guest state

    elif event_type == "order.state.updated":
        print(f"Order {event_id} state updated")
        # TODO: sync the order lifecycle

    elif event_type == "order.status.updated":
        print(f"Order {event_id} status updated")
        # TODO: refresh kitchen and front-of-house displays

    elif event_type == "order.total.updated":
        print(f"Order {event_id} total updated")
        # TODO: reconcile totals

    elif event_type == "order.payments.added":
        print(f"Payment added to order {event_id}")
        # TODO: record the payment for accounting

    elif event_type == "product.availability.updated":
        print(f"Product {event_id} availability updated")
        # TODO: sync menu and stock

    else:
        print(f"Unhandled Mews POS event: {event_type}")


@app.post("/webhooks/mews-pos")
async def mews_pos_webhook(request: Request):
    # Read the raw bytes so any content type works and the exact body is verified.
    raw_body = await request.body()

    if not verify_mews_pos_signature(raw_body, request.headers.get("x-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # The body is untrusted: check each level before reading into it.
    meta = event.get("meta") if isinstance(event, dict) else None
    event_type = meta.get("eventType") if isinstance(meta, dict) else None
    if not isinstance(event_type, str):
        raise HTTPException(status_code=400, detail="Expected { data, meta: { eventType } }")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    try:
        handle_event(event_type, data)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Mews POS webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
