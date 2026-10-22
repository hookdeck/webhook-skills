# Generated with: unit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_unit_signature(raw_body: bytes, signature: str | None, token: str | None) -> bool:
    """Unit signs the ENTIRE raw body with HMAC-SHA1, keyed by the webhook token
    (a UTF-8 string), and sends the base64 digest in X-Unit-Signature."""
    if not signature or not token:
        return False
    digest = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest), signature.encode("utf-8"))


@app.post("/webhooks/unit")
async def unit_webhook(request: Request):
    # Read the RAW bytes (any content type) - never parse JSON before verifying.
    raw_body = await request.body()

    signature = request.headers.get("x-unit-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Unit-Signature header")
    if not verify_unit_signature(raw_body, signature, os.environ.get("UNIT_WEBHOOK_TOKEN")):
        print("Unit webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # `data` is an array of events (up to 64 with AtLeastOnce delivery).
    events = payload.get("data") if isinstance(payload, dict) else None
    for event in events if isinstance(events, list) else []:
        # TODO: dedupe on event["id"] (Unit retries AtLeastOnce deliveries)
        event_type = event.get("type")
        relationships = event.get("relationships") or {}

        def related_id(name: str):
            return ((relationships.get(name) or {}).get("data") or {}).get("id")

        if event_type == "application.approved":
            print("Application approved:", related_id("application"))
            # TODO: Start onboarding for the new customer
        elif event_type == "application.denied":
            print("Application denied:", related_id("application"))
            # TODO: Notify the applicant
        elif event_type == "customer.created":
            print("Customer created:", related_id("customer"))
            # TODO: Sync the customer record
        elif event_type == "account.created":
            print("Account created:", related_id("account"))
            # TODO: Store the account id
        elif event_type == "transaction.created":
            print("Transaction created:", related_id("transaction"))
            # TODO: Update your ledger
        elif event_type == "payment.clearing":
            print("Payment clearing:", related_id("payment"))
            # TODO: Mark the payment as clearing
        elif event_type == "payment.returned":
            print("Payment returned:", related_id("payment"))
            # TODO: Reverse the payment and alert
        else:
            # Unit adds event types over time; ignore the ones you don't handle.
            print(f"Unhandled event type: {event_type}")

    # Unit expects HTTP 200 (AtMostOnce deliveries are not retried otherwise).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
