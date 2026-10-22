import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_paysafe_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Paysafe webhook signature.

    Signature header = base64(HMAC_SHA256(hmacKey, raw JSON body)).
    The HMAC key is used as a raw UTF-8 string (it is NOT base64-decoded).
    """
    if not raw_body or not signature_header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/paysafe")
async def paysafe_webhook(request: Request):
    # Read the raw body - never parse before verifying
    raw_body = await request.body()
    signature = request.headers.get("signature")

    if not raw_body:
        raise HTTPException(status_code=400, detail="Missing request body")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing Signature header")

    if not verify_paysafe_webhook(raw_body, signature, os.getenv("PAYSAFE_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_name = event.get("eventName")
    resource_id = event.get("resourceId")
    print(f"Received {event_name} for {resource_id} (attempt {event.get('attemptNumber')})")

    if event_name in ("PAYMENT_HANDLE_INITIATED", "PAYMENT_HANDLE_PROCESSING", "PAYMENT_HANDLE_PAYABLE"):
        print(f"Payment handle update: {resource_id}")
    elif event_name == "PAYMENT_HANDLE_COMPLETED":
        print(f"Payment handle completed: {resource_id}")
        # TODO: Create the payment using the handle's paymentHandleToken
    elif event_name == "PAYMENT_HANDLE_FAILED":
        print(f"Payment handle failed: {resource_id}")
        # TODO: Notify the customer, offer another payment method
    elif event_name == "PAYMENT_COMPLETED":
        print(f"Payment completed: {resource_id}")
        # TODO: Fulfil the order
    elif event_name in ("PAYMENT_FAILED", "PAYMENT_CANCELLED"):
        print(f"Payment failed or cancelled: {resource_id}")
        # TODO: Release inventory, notify the customer
    elif event_name == "PAYMENT_HELD":
        print(f"Payment held for risk review: {resource_id}")
    elif event_name == "SETTLEMENT_COMPLETED":
        print(f"Settlement completed: {resource_id}")
        # TODO: Reconcile the settlement
    elif event_name == "SETTLEMENT_FAILED":
        print(f"Settlement failed: {resource_id}")
    else:
        print(f"Unhandled event: {event_name}")

    # 2xx acknowledges receipt; 4xx/5xx makes Paysafe retry (up to 3 times)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
