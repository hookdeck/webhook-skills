import os
import re
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_returnless_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Returnless webhook signature.

    X-Signature is the bare lowercase hex HMAC-SHA256 of the raw body, keyed with the
    webhook's signing secret (its UTF-8 bytes, used as-is).
    """
    if not signature_header or not secret:
        return False

    # Validate the format first: exactly 64 hex characters
    if not HEX_64.fullmatch(signature_header):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Constant-time comparison on bytes
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())


@app.post("/webhooks/returnless")
async def returnless_webhook(request: Request):
    # Read at request time so the secret can be changed without a restart
    secret = os.environ.get("RETURNLESS_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for signature verification, whatever the Content-Type
    raw_body = await request.body()
    signature_header = request.headers.get("x-signature")

    if not signature_header:
        raise HTTPException(status_code=401, detail="Missing X-Signature header")

    if not verify_returnless_webhook(raw_body, signature_header, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in the X-Event-Name header, not the body
    event = request.headers.get("x-event-name")
    data = payload.get("data") if isinstance(payload, dict) else None
    resource_id = data.get("id") if isinstance(data, dict) else None
    print(f"Received {event} event ({resource_id})")

    if event == "request.created":
        print(f"Return request {resource_id} submitted")
    elif event in (
        "request.approved",
        "request.approved_with_manual_shipment",
        "request.approved_without_shipment",
    ):
        print(f"Return request {resource_id} approved ({event})")
        # TODO: Notify the customer or create a label
    elif event == "request.rejected":
        print(f"Return request {resource_id} rejected")
    elif event == "return.created":
        print(f"Return {resource_id} created")
        # TODO: Sync the return to your ERP or OMS
    elif event == "return.product.marked_as_received":
        print(f"Returned product received on {resource_id}")
        # TODO: Restock inventory or trigger a refund
    elif event == "shipment.delivered":
        print(f"Shipment {resource_id} delivered")
    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt (any 2XX counts as success)
    return {"status": "success"}


@app.get("/health")
async def health():
    return {"status": "ok"}
